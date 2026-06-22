namespace KwestKarz.Api

open System
open System.Threading
open Amazon
open Amazon.SimpleNotificationService
open Amazon.SimpleNotificationService.Model
open Amazon.SimpleEmailV2
open Amazon.SimpleEmailV2.Model
open Npgsql
open NpgsqlTypes

module NotificationService =

    type NotificationConfig =
        { AdminTopicArn: string
          SenderEmail: string
          AwsRegion: string }

    let private isConfigured (config: NotificationConfig) =
        not (String.IsNullOrWhiteSpace(config.AdminTopicArn)) &&
        not (String.IsNullOrWhiteSpace(config.SenderEmail)) &&
        not (String.IsNullOrWhiteSpace(config.AwsRegion))

    let private writeLog (dataSource: NpgsqlDataSource) (userId: Guid option) (jobId: Guid option) (eventType: string) (channel: string) (recipient: string) (subject: string) (status: string) (error: string option) =
        task {
            try
                use! conn = dataSource.OpenConnectionAsync(CancellationToken.None)
                use cmd =
                    new NpgsqlCommand(
                        """insert into kwestkarzbusinessdata.notification_log
                           (user_id, job_id, event_type, channel, recipient, subject, status, error, sent_at)
                           values (@userId, @jobId, @eventType, @channel, @recipient, @subject, @status, @error, now())""",
                        conn
                    )
                let dbGuid (v: Guid option) = v |> Option.map (fun g -> box g) |> Option.defaultValue (box DBNull.Value)
                let dbText (v: string option) = v |> Option.map box |> Option.defaultValue (box DBNull.Value)
                cmd.Parameters.AddWithValue("userId",    NpgsqlDbType.Uuid,    dbGuid userId) |> ignore
                cmd.Parameters.AddWithValue("jobId",     NpgsqlDbType.Uuid,    dbGuid jobId)  |> ignore
                cmd.Parameters.AddWithValue("eventType", NpgsqlDbType.Text,    eventType)     |> ignore
                cmd.Parameters.AddWithValue("channel",   NpgsqlDbType.Text,    channel)       |> ignore
                cmd.Parameters.AddWithValue("recipient", NpgsqlDbType.Text,    recipient)     |> ignore
                cmd.Parameters.AddWithValue("subject",   NpgsqlDbType.Text,    subject)       |> ignore
                cmd.Parameters.AddWithValue("status",    NpgsqlDbType.Text,    status)        |> ignore
                cmd.Parameters.AddWithValue("error",     NpgsqlDbType.Text,    dbText error)  |> ignore
                let! _ = cmd.ExecuteNonQueryAsync(CancellationToken.None)
                ()
            with _ -> () // never fail the caller over a log write
        }

    let private publishSns (config: NotificationConfig) (topicArn: string) (subject: string) (message: string) =
        task {
            let region = RegionEndpoint.GetBySystemName(config.AwsRegion)
            use client = new AmazonSimpleNotificationServiceClient(region)
            let req = PublishRequest(TopicArn = topicArn, Subject = subject, Message = message)
            let! _ = client.PublishAsync(req, CancellationToken.None)
            ()
        }

    let private sendSes (config: NotificationConfig) (toEmail: string) (subject: string) (textBody: string) (htmlBody: string) =
        task {
            let region = RegionEndpoint.GetBySystemName(config.AwsRegion)
            use client = new AmazonSimpleEmailServiceV2Client(region)
            let req =
                SendEmailRequest(
                    FromEmailAddress = $"KwestKarz Fleet <{config.SenderEmail}>",
                    Destination = Destination(ToAddresses = ResizeArray([toEmail])),
                    Content =
                        EmailContent(
                            Simple =
                                Amazon.SimpleEmailV2.Model.Message(
                                    Subject = Amazon.SimpleEmailV2.Model.Content(Data = subject),
                                    Body = Body(
                                        Text = Amazon.SimpleEmailV2.Model.Content(Data = textBody),
                                        Html = Amazon.SimpleEmailV2.Model.Content(Data = htmlBody)
                                    )
                                )
                        )
                )
            let! _ = client.SendEmailAsync(req, CancellationToken.None)
            ()
        }

    // Publish an alert to the admin SNS topic
    let publishAdminAlert (config: NotificationConfig) (dataSource: NpgsqlDataSource) (eventType: string) (subject: string) (message: string) (jobId: Guid option) =
        task {
            if not (isConfigured config) then ()
            else
                try
                    do! publishSns config config.AdminTopicArn subject message
                    do! writeLog dataSource None jobId eventType "SNS" config.AdminTopicArn subject "Sent" None
                with ex ->
                    do! writeLog dataSource None jobId eventType "SNS" config.AdminTopicArn subject "Failed" (Some ex.Message)
        }

    // Send a job-related email to one helper and log it
    let private sendHelperEmail (config: NotificationConfig) (dataSource: NpgsqlDataSource) (userId: Guid) (jobId: Guid) (eventType: string) (toEmail: string) (subject: string) (textBody: string) (htmlBody: string) =
        task {
            try
                do! sendSes config toEmail subject textBody htmlBody
                do! writeLog dataSource (Some userId) (Some jobId) eventType "Email" toEmail subject "Sent" None
            with ex ->
                do! writeLog dataSource (Some userId) (Some jobId) eventType "Email" toEmail subject "Failed" (Some ex.Message)
        }

    // Email all opted-in active users when a new job is posted
    let notifyHelpersJobPosted (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (jobDescription: string option) =
        task {
            if not (isConfigured config) then ()
            else
                try
                    use! conn = dataSource.OpenConnectionAsync(CancellationToken.None)
                    use cmd =
                        new NpgsqlCommand(
                            """select id, email_address, coalesce(display_name, phone)
                               from kwestkarzbusinessdata.users
                               where notify_by_email = true
                                 and email_address is not null
                                 and status = 'active'""",
                            conn
                        )
                    use! reader = cmd.ExecuteReaderAsync(CancellationToken.None)
                    let subscribers = ResizeArray()
                    while! reader.ReadAsync(CancellationToken.None) do
                        subscribers.Add(reader.GetGuid(0), reader.GetString(1), reader.GetString(2))
                    do! reader.DisposeAsync()

                    for (userId, email, name) in subscribers do
                        let subject = $"New Job Available — {jobTitle}"
                        let desc = jobDescription |> Option.defaultValue "No description provided."
                        let textBody =
                            $"Hi {name},\n\nA new job is available on KwestKarz.\n\nJob: {jobTitle}\nDetails: {desc}\n\nLog in to view and claim it.\n\n— KwestKarz Fleet Management"
                        let htmlTemplate = """<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
<div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0;">
  <h1 style="color:#fff;font-size:18px;margin:0;">KwestKarz Fleet Management</h1>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <p style="margin:0 0 16px;">Hi <strong>{{NAME}}</strong>,</p>
  <p style="margin:0 0 16px;">A new job is available and ready to claim.</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
    <tr style="background:#f8fafc;">
      <td style="padding:10px 14px;font-weight:600;border:1px solid #e2e8f0;">Job</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;">{{TITLE}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;font-weight:600;border:1px solid #e2e8f0;">Details</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;">{{DESC}}</td>
    </tr>
  </table>
  <p style="font-size:13px;color:#64748b;">Log in to KwestKarz to view and claim this job.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
  <p style="margin:0;color:#94a3b8;font-size:12px;">KwestKarz Fleet Management &#8212; automated notification</p>
</div>
</body></html>"""
                        let htmlBody = htmlTemplate.Replace("{{NAME}}", name).Replace("{{TITLE}}", jobTitle).Replace("{{DESC}}", desc)
                        do! sendHelperEmail config dataSource userId jobId "JobPosted" email subject textBody htmlBody
                with _ -> () // never fail the request
        }

    let notifyAdminJobClaimed (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (claimedBy: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = $"Job Claimed — {jobTitle}"
                let message = $"Job '{jobTitle}' was claimed by {claimedBy}.\n\nJob ID: {jobId}"
                do! publishAdminAlert config dataSource "JobClaimed" subject message (Some jobId)
        }

    let notifyAdminJobCompleted (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (completedBy: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = $"Job Completed — {jobTitle}"
                let message = $"Job '{jobTitle}' was marked complete by {completedBy}.\n\nCompleted at: {DateTimeOffset.UtcNow:u}\nJob ID: {jobId}"
                do! publishAdminAlert config dataSource "JobCompleted" subject message (Some jobId)
        }

    let notifyJobCanceled (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (canceledBy: string) (claimedByUserId: Guid option) =
        task {
            if not (isConfigured config) then ()
            else
                // Admin SNS alert
                let subject = $"Job Canceled — {jobTitle}"
                let message = $"Job '{jobTitle}' was canceled by {canceledBy}.\n\nJob ID: {jobId}"
                do! publishAdminAlert config dataSource "JobCanceled" subject message (Some jobId)

                // Email the helper who had it claimed, if any
                match claimedByUserId with
                | None -> ()
                | Some uid ->
                    try
                        use! conn = dataSource.OpenConnectionAsync(CancellationToken.None)
                        use cmd =
                            new NpgsqlCommand(
                                """select id, email_address, coalesce(display_name, phone)
                                   from kwestkarzbusinessdata.users
                                   where id = @uid and notify_by_email = true and email_address is not null""",
                                conn
                            )
                        cmd.Parameters.AddWithValue("uid", NpgsqlDbType.Uuid, uid) |> ignore
                        use! reader = cmd.ExecuteReaderAsync(CancellationToken.None)
                        let! hasRow = reader.ReadAsync(CancellationToken.None)
                        if hasRow then
                            let userId = reader.GetGuid(0)
                            let email = reader.GetString(1)
                            let name = reader.GetString(2)
                            do! reader.DisposeAsync()
                            let emailSubject = $"Job Canceled — {jobTitle}"
                            let textBody = $"Hi {name},\n\nA job you claimed has been canceled.\n\nJob: {jobTitle}\nCanceled by: {canceledBy}\n\n— KwestKarz Fleet Management"
                            let htmlTemplate = """<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;">
<div style="background:#0f172a;padding:16px 24px;border-radius:8px 8px 0 0;">
  <h1 style="color:#fff;font-size:18px;margin:0;">KwestKarz Fleet Management</h1>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <p style="margin:0 0 16px;">Hi <strong>{{NAME}}</strong>,</p>
  <p style="margin:0 0 16px;">A job you had claimed has been canceled.</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
    <tr style="background:#f8fafc;">
      <td style="padding:10px 14px;font-weight:600;border:1px solid #e2e8f0;">Job</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;">{{TITLE}}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;font-weight:600;border:1px solid #e2e8f0;">Canceled by</td>
      <td style="padding:10px 14px;border:1px solid #e2e8f0;">{{BY}}</td>
    </tr>
  </table>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
  <p style="margin:0;color:#94a3b8;font-size:12px;">KwestKarz Fleet Management &#8212; automated notification</p>
</div>
</body></html>"""
                            let htmlBody = htmlTemplate.Replace("{{NAME}}", name).Replace("{{TITLE}}", jobTitle).Replace("{{BY}}", canceledBy)
                            do! sendHelperEmail config dataSource userId jobId "JobCanceled" email emailSubject textBody htmlBody
                    with _ -> ()
        }

    let notifyAdminNewUser (config: NotificationConfig) (dataSource: NpgsqlDataSource) (phone: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "New User Registration — KwestKarz"
                let message = $"A new user has registered and is awaiting approval.\n\nPhone: {phone}\n\nLog in to approve."
                do! publishAdminAlert config dataSource "UserRegistered" subject message None
        }

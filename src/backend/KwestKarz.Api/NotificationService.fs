namespace KwestKarz.Api

open System
open System.Threading
open Amazon
open Amazon.SimpleEmailV2
open Amazon.SimpleEmailV2.Model
open Amazon.SimpleNotificationService
open Amazon.SimpleNotificationService.Model
open Npgsql
open NpgsqlTypes

module NotificationService =

    type NotificationConfig =
        { AdminTopicArn : string
          AdminEmail    : string
          SenderEmail   : string
          AwsRegion     : string }

    let private isConfigured (config: NotificationConfig) =
        not (String.IsNullOrWhiteSpace(config.SenderEmail)) &&
        not (String.IsNullOrWhiteSpace(config.AwsRegion))

    // ── Logging ──────────────────────────────────────────────────────────────

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
                let dbGuid (v: Guid option) = v |> Option.map box |> Option.defaultValue (box DBNull.Value)
                let dbText (v: string option) = v |> Option.map box |> Option.defaultValue (box DBNull.Value)
                cmd.Parameters.AddWithValue("userId",    NpgsqlDbType.Uuid, dbGuid userId) |> ignore
                cmd.Parameters.AddWithValue("jobId",     NpgsqlDbType.Uuid, dbGuid jobId)  |> ignore
                cmd.Parameters.AddWithValue("eventType", NpgsqlDbType.Text, eventType)     |> ignore
                cmd.Parameters.AddWithValue("channel",   NpgsqlDbType.Text, channel)       |> ignore
                cmd.Parameters.AddWithValue("recipient", NpgsqlDbType.Text, recipient)     |> ignore
                cmd.Parameters.AddWithValue("subject",   NpgsqlDbType.Text, subject)       |> ignore
                cmd.Parameters.AddWithValue("status",    NpgsqlDbType.Text, status)        |> ignore
                cmd.Parameters.AddWithValue("error",     NpgsqlDbType.Text, dbText error)  |> ignore
                let! _ = cmd.ExecuteNonQueryAsync(CancellationToken.None)
                ()
            with _ -> ()
        }

    // ── AWS SES ───────────────────────────────────────────────────────────────

    let private sendSes (config: NotificationConfig) (toEmail: string) (subject: string) (textBody: string) (htmlBody: string) =
        task {
            let region = RegionEndpoint.GetBySystemName(config.AwsRegion)
            use client = new AmazonSimpleEmailServiceV2Client(region)
            let req =
                SendEmailRequest(
                    FromEmailAddress = "KwestKarz Fleet <" + config.SenderEmail + ">",
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

    // Keep for potential future use (SMS, mobile push via SNS fanout)
    let publishAdminAlert (config: NotificationConfig) (dataSource: NpgsqlDataSource) (eventType: string) (subject: string) (message: string) (jobId: Guid option) =
        task {
            if not (String.IsNullOrWhiteSpace(config.AdminTopicArn)) then
                try
                    let region = RegionEndpoint.GetBySystemName(config.AwsRegion)
                    use client = new AmazonSimpleNotificationServiceClient(region)
                    let req = PublishRequest(TopicArn = config.AdminTopicArn, Subject = subject, Message = message)
                    let! _ = client.PublishAsync(req, CancellationToken.None)
                    do! writeLog dataSource None jobId eventType "SNS" config.AdminTopicArn subject "Sent" None
                with ex ->
                    do! writeLog dataSource None jobId eventType "SNS" config.AdminTopicArn subject "Failed" (Some ex.Message)
        }

    // ── HTML Email Builder ────────────────────────────────────────────────────
    //
    // All HTML is built with string concatenation or .Replace() — NOT F# string
    // interpolation — because CSS semicolons inside $"""...""" confuse the compiler.

    let private emailRow (bg: string) (key: string) (value: string) =
        "<tr>" +
        "<td style=\"padding:11px 14px;background-color:" + bg + ";font-weight:600;font-size:13px;color:#374151;border:1px solid #e2e8f0;width:140px;vertical-align:top;\">" + key + "</td>" +
        "<td style=\"padding:11px 14px;background-color:" + bg + ";font-size:13px;color:#1e293b;border:1px solid #e2e8f0;line-height:1.5;\">" + value + "</td>" +
        "</tr>"

    let private buildRows (rows: (string * string) list) =
        if rows.IsEmpty then ""
        else
            let inner =
                rows
                |> List.mapi (fun i (k, v) -> emailRow (if i % 2 = 0 then "#f8fafc" else "#ffffff") k v)
                |> String.concat ""
            "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-collapse:collapse;margin:0 0 20px 0;\">" + inner + "</table>"

    let private baseTemplate =
        """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr>
  <td style="background-color:#0f172a;padding:20px 28px;border-radius:8px 8px 0 0;">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">KwestKarz</span>&#160;<span style="color:#94a3b8;font-size:13px;font-weight:400;">Fleet Management</span>
  </td>
</tr>
<tr><td style="background-color:{{ACCENT}};height:3px;line-height:3px;font-size:1px;">&#160;</td></tr>
<tr>
  <td style="background-color:#ffffff;padding:28px;border:1px solid #e2e8f0;border-top:none;">
    <h2 style="margin:0 0 6px 0;font-size:18px;color:#0f172a;font-weight:700;">{{TITLE}}</h2>
    <p style="margin:0 0 22px 0;font-size:14px;color:#475569;line-height:1.6;">{{INTRO}}</p>
    {{ROWS}}
    <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">{{ACTION}}</p>
  </td>
</tr>
<tr>
  <td style="background-color:#f8fafc;padding:14px 28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">KwestKarz Fleet Management &#8212; automated notification. Do not reply to this email.</p>
  </td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    let private buildEmail (accent: string) (title: string) (intro: string) (rows: (string * string) list) (action: string) =
        baseTemplate
            .Replace("{{ACCENT}}", accent)
            .Replace("{{TITLE}}", title)
            .Replace("{{INTRO}}", intro)
            .Replace("{{ROWS}}", buildRows rows)
            .Replace("{{ACTION}}", action)

    // ── Send wrappers ─────────────────────────────────────────────────────────

    let private sendAdminEmail (config: NotificationConfig) (dataSource: NpgsqlDataSource) (eventType: string) (jobId: Guid option) (subject: string) (textBody: string) (htmlBody: string) =
        task {
            if not (String.IsNullOrWhiteSpace(config.AdminEmail)) then
                try
                    do! sendSes config config.AdminEmail subject textBody htmlBody
                    do! writeLog dataSource None jobId eventType "Email" config.AdminEmail subject "Sent" None
                with ex ->
                    do! writeLog dataSource None jobId eventType "Email" config.AdminEmail subject "Failed" (Some ex.Message)
        }

    let private sendHelperEmail (config: NotificationConfig) (dataSource: NpgsqlDataSource) (userId: Guid) (jobId: Guid) (eventType: string) (toEmail: string) (subject: string) (textBody: string) (htmlBody: string) =
        task {
            try
                do! sendSes config toEmail subject textBody htmlBody
                do! writeLog dataSource (Some userId) (Some jobId) eventType "Email" toEmail subject "Sent" None
            with ex ->
                do! writeLog dataSource (Some userId) (Some jobId) eventType "Email" toEmail subject "Failed" (Some ex.Message)
        }

    // ── Public notification functions ─────────────────────────────────────────

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

                    let desc = jobDescription |> Option.defaultValue "No description provided."
                    for (userId, email, name) in subscribers do
                        let subject = "New Job Available — " + jobTitle
                        let textBody =
                            "Hi " + name + ",\n\n" +
                            "A new job is available on KwestKarz.\n\n" +
                            "Job: " + jobTitle + "\n" +
                            "Details: " + desc + "\n\n" +
                            "Log in to view and claim it.\n\n" +
                            "— KwestKarz Fleet Management"
                        let htmlBody =
                            buildEmail
                                "#3b82f6"
                                "New Job Available"
                                ("Hi " + name + ", a new job has been posted and is ready to claim.")
                                [("Job", jobTitle); ("Details", desc)]
                                "Log in to KwestKarz to view and claim this job."
                        do! sendHelperEmail config dataSource userId jobId "JobPosted" email subject textBody htmlBody
                with _ -> ()
        }

    let notifyAdminJobClaimed (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (claimedBy: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "Job Claimed — " + jobTitle
                let ts = DateTimeOffset.UtcNow.ToString("R")
                let textBody =
                    "Job '" + jobTitle + "' was claimed by " + claimedBy + ".\n\n" +
                    "Claimed at: " + ts + "\n" +
                    "Job ID: " + string jobId
                let htmlBody =
                    buildEmail
                        "#10b981"
                        "Job Claimed"
                        "A helper has claimed a job and is ready to work on it."
                        [("Job", jobTitle); ("Claimed by", claimedBy); ("Claimed at", ts)]
                        ""
                do! sendAdminEmail config dataSource "JobClaimed" (Some jobId) subject textBody htmlBody
        }

    let notifyAdminJobCompleted (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (completedBy: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "Job Completed — " + jobTitle
                let ts = DateTimeOffset.UtcNow.ToString("R")
                let textBody =
                    "Job '" + jobTitle + "' was marked complete by " + completedBy + ".\n\n" +
                    "Completed at: " + ts + "\n" +
                    "Job ID: " + string jobId
                let htmlBody =
                    buildEmail
                        "#10b981"
                        "Job Completed"
                        "A job has been successfully completed."
                        [("Job", jobTitle); ("Completed by", completedBy); ("Completed at", ts)]
                        "A labor expense entry has been created automatically."
                do! sendAdminEmail config dataSource "JobCompleted" (Some jobId) subject textBody htmlBody
        }

    let notifyJobCanceled (config: NotificationConfig) (dataSource: NpgsqlDataSource) (jobId: Guid) (jobTitle: string) (canceledBy: string) (claimedByUserId: Guid option) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "Job Canceled — " + jobTitle
                let ts = DateTimeOffset.UtcNow.ToString("R")

                // Admin notification
                let adminText =
                    "Job '" + jobTitle + "' was canceled by " + canceledBy + ".\n\n" +
                    "Canceled at: " + ts + "\n" +
                    "Job ID: " + string jobId
                let adminHtml =
                    buildEmail
                        "#f59e0b"
                        "Job Canceled"
                        "A job has been canceled."
                        [("Job", jobTitle); ("Canceled by", canceledBy); ("Canceled at", ts)]
                        ""
                do! sendAdminEmail config dataSource "JobCanceled" (Some jobId) subject adminText adminHtml

                // Notify the helper who had it claimed, if any
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
                            let email  = reader.GetString(1)
                            let name   = reader.GetString(2)
                            do! reader.DisposeAsync()
                            let helperText =
                                "Hi " + name + ",\n\n" +
                                "A job you had claimed has been canceled.\n\n" +
                                "Job: " + jobTitle + "\n" +
                                "Canceled by: " + canceledBy + "\n\n" +
                                "— KwestKarz Fleet Management"
                            let helperHtml =
                                buildEmail
                                    "#f59e0b"
                                    "Job Canceled"
                                    ("Hi " + name + ", a job you had claimed has been canceled.")
                                    [("Job", jobTitle); ("Canceled by", canceledBy); ("Canceled at", ts)]
                                    "No further action is required. Check the job board for new opportunities."
                            do! sendHelperEmail config dataSource userId jobId "JobCanceled" email subject helperText helperHtml
                    with _ -> ()
        }

    let notifyAdminNewUser (config: NotificationConfig) (dataSource: NpgsqlDataSource) (phone: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "New User Registration — KwestKarz"
                let ts = DateTimeOffset.UtcNow.ToString("R")
                let textBody =
                    "A new user has registered and is awaiting approval.\n\n" +
                    "Phone: " + phone + "\n" +
                    "Registered at: " + ts + "\n\n" +
                    "Log in to approve."
                let htmlBody =
                    buildEmail
                        "#8b5cf6"
                        "New User Registration"
                        "A new user has registered and is awaiting your approval."
                        [("Phone", phone); ("Registered at", ts); ("Action needed", "Approve or suspend this user in the Users panel")]
                        "Log in to KwestKarz to review this user."
                do! sendAdminEmail config dataSource "UserRegistered" None subject textBody htmlBody
        }

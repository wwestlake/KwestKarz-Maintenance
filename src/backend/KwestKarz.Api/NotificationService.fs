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

    let private sendSes (config: NotificationConfig) (toEmail: string) (subject: string) (body: string) =
        task {
            let region = RegionEndpoint.GetBySystemName(config.AwsRegion)
            use client = new AmazonSimpleEmailServiceV2Client(region)
            let req =
                SendEmailRequest(
                    FromEmailAddress = config.SenderEmail,
                    Destination = Destination(ToAddresses = ResizeArray([toEmail])),
                    Content =
                        EmailContent(
                            Simple =
                                Amazon.SimpleEmailV2.Model.Message(
                                    Subject = Amazon.SimpleEmailV2.Model.Content(Data = subject),
                                    Body = Body(Text = Amazon.SimpleEmailV2.Model.Content(Data = body))
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
    let private sendHelperEmail (config: NotificationConfig) (dataSource: NpgsqlDataSource) (userId: Guid) (jobId: Guid) (eventType: string) (toEmail: string) (subject: string) (body: string) =
        task {
            try
                do! sendSes config toEmail subject body
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
                        let desc = jobDescription |> Option.defaultValue "(no description)"
                        let body = $"Hi {name},\n\nA new job has been posted on KwestKarz.\n\nJob: {jobTitle}\nDetails: {desc}\n\nLog in to view and claim it.\n\n— KwestKarz Fleet Management"
                        do! sendHelperEmail config dataSource userId jobId "JobPosted" email subject body
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

    let notifyAdminNewUser (config: NotificationConfig) (dataSource: NpgsqlDataSource) (phone: string) =
        task {
            if not (isConfigured config) then ()
            else
                let subject = "New User Registration — KwestKarz"
                let message = $"A new user has registered and is awaiting approval.\n\nPhone: {phone}\n\nLog in to approve."
                do! publishAdminAlert config dataSource "UserRegistered" subject message None
        }

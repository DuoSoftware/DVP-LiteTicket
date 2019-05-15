var dvpEventsHandler = require('../Trigger/EmailHandler').PublishToDVPEvents;

var publishEvent = function (ticketObj, eventType, data, additionalData, populate) {

    //Get Ticket
    var evtName = data;
    if(data === 'new')
    {
        evtName = 'new ticket';
    }

    var evtType = eventType;

    if(eventType === 'change_status')
    {
        evtType = 'STATUS_CHANGE';
    }
    else if(eventType === 'change_assignee' || eventType === 'change_assignee_groups')
    {
        evtType = 'ASSIGNEE_CHANGED';
        evtName = evtType;
    }
    else if(eventType === 'add_comment')
    {
        evtType = 'ADD_COMMENT';
        evtName = 'comment added';
        otherData = data.body
    }

    var otherData = null;
    var requester = "";
    var assignee = "";
    var submitter = "";

    if(populate)
    {
        Ticket.findOne({_id: ticketObj}).populate('requester', '-password').populate('submitter', '-password').populate('assignee', '-password').populate('assignee_group collaborators watchers attachments comments').populate('form_submission').lean().exec(function (err, tResult) {

            if(tResult)
            {
                if(tResult.requester)
                {
                    requester = tResult.requester.firstname + ' ' + tResult.requester.lastname;
                }
                if(tResult.submitter)
                {
                    submitter = tResult.submitter.username;
                }
                if(tResult.assignee)
                {
                    assignee = tResult.assignee.username;
                }
                var evtData =
                    {
                        SessionId: tResult._id,
                        EventName: evtName,
                        CompanyId: tResult.company,
                        TenantId: tResult.tenant,
                        EventClass: "TICKET",
                        EventType: "TICKET",
                        EventCategory: evtType,
                        EventTime: new Date().toISOString(),
                        EventData: "",
                        EventParams: "",
                        EventSpecificData: {
                            EventType: evtType,
                            TicketState: tResult.status,
                            Subject: tResult.subject,
                            Reference: tResult.reference,
                            Tags: JSON.stringify(tResult.tags),
                            TicketType: tResult.type,
                            Priority: tResult.priority,
                            Requester: requester,
                            Submitter: submitter,
                            Assignee: assignee,
                            Other: otherData,
                            BusinessUnit: tResult.businessUnit,
                            Timestamp: new Date().valueOf()

                        },
                        BusinessUnit: tResult.businessUnit
                    };

                dvpEventsHandler(evtData)
            }

        });
    }
    else
    {
        if(ticketObj.requester)
        {
            requester = ticketObj.requester.firstname + ' ' + ticketObj.requester.lastname;
        }
        if(ticketObj.submitter)
        {
            submitter = ticketObj.submitter.username;
        }
        if(ticketObj.assignee)
        {
            assignee = ticketObj.assignee.username;
        }

        var evtData =
            {
                SessionId: ticketObj._id,
                EventName: evtName,
                CompanyId: ticketObj.company,
                TenantId: ticketObj.tenant,
                EventClass: "TICKET",
                EventType: "TICKET",
                EventCategory: evtType,
                EventTime: new Date().toISOString(),
                EventData: "",
                EventParams: "",
                EventSpecificData: {
                    EventType: evtType,
                    TicketState: ticketObj.status,
                    Subject: ticketObj.subject,
                    Reference: ticketObj.reference,
                    Tags: JSON.stringify(ticketObj.tags),
                    TicketType: ticketObj.type,
                    Priority: ticketObj.priority,
                    Requester: requester,
                    Submitter: submitter,
                    Assignee: assignee,
                    Other: otherData,
                    BusinessUnit: ticketObj.businessUnit,
                    Timestamp: new Date().valueOf()

                },
                BusinessUnit: ticketObj.businessUnit
            };

        dvpEventsHandler(evtData)

    }


};

module.exports.PublishEvent = publishEvent;
var mongoose = require('mongoose');
var json2csv = require('json2csv');
var fs = require('fs');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var RecentTicket = require('dvp-mongomodels/model/RecentTickets').RecentTicket;
var RecentUserTicket = require('dvp-mongomodels/model/RecentTickets').RecentUserTickets;
var ExternalUserRecentTicket = require('dvp-mongomodels/model/ExternalUserRecentTicket').ExternalUserRecentTicket;
var TicketEvent = require('dvp-mongomodels/model/Ticket').TicketEvent;
var TicketStatusFlow = require('dvp-mongomodels/model/TicketStatusFlow').TicketStatusFlow;
var TicketStatusNode = require('dvp-mongomodels/model/TicketStatusFlow').TicketStatusNode;
var BulkOperation = require('dvp-mongomodels/model/BulkOperation').BulkOperation;
var User = require('dvp-mongomodels/model/User');
var UserAccount = require('dvp-mongomodels/model/UserAccount');
var UserGroup = require('dvp-mongomodels/model/UserGroup').UserGroup;
var ExternalUser = require('dvp-mongomodels/model/ExternalUser').ExternalUser;
var Attachment = require('dvp-mongomodels/model/Attachment').Attachment;
var Tag = require('dvp-mongomodels/model/Tag').Tag;
var TimeEntry = require('dvp-mongomodels/model/TimeEntry').TimeEntry;
var Comment = require('dvp-mongomodels/model/Comment').Comment;
var TicketStatics = require('dvp-mongomodels/model/TicketMetrix').TicketStatics;
var Case = require('dvp-mongomodels/model/CaseManagement').Case;
var CaseConfiguration = require('dvp-mongomodels/model/CaseManagement').CaseConfiguration;
var FileSlotArray = require('dvp-mongomodels/model/Ticket').FileSlotArray;
var FileSlot = require('dvp-mongomodels/model/Ticket').FileSlot;


/*var CaseConfiguration = require('dvp-mongomodels/model/CaseConfiguration').CaseConfiguration;*/
var EngagementSession = require('dvp-mongomodels/model/Engagement').EngagementSession;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var triggerWorker = require('../Workers/Trigger/TriggerWorker');
var slaWorker = require('../Workers/SLA/SLAWorker.js');
var caseWorker = require('../Workers/Case/CaseWorker');

var SendTicketNotification = require("../Workers/Trigger/DvpNotification.js").SendTicketNotification;

var deepcopy = require("deepcopy");
var diff = require('deep-diff').diff;
var format = require('stringformat');
var config = require('config');
var q = require('q');
var amqp = require('amqp');
var moment = require("moment");
var util = require('util');
var redis = require('ioredis');
var uuid = require('node-uuid');

var redisip = config.Redis.ip;
var redisport = config.Redis.port;
var redispass = config.Redis.password;
var redismode = config.Redis.mode;
var redisdb = config.Redis.db;


var redisSetting = {
    port: redisport,
    host: redisip,
    family: 4,
    password: redispass,
    db: redisdb,
    retryStrategy: function (times) {
        var delay = Math.min(times * 50, 2000);
        return delay;
    },
    reconnectOnError: function (err) {

        return true;
    }
};

if (redismode == 'sentinel') {

    if (config.Redis.sentinels && config.Redis.sentinels.hosts && config.Redis.sentinels.port && config.Redis.sentinels.name) {
        var sentinelHosts = config.Redis.sentinels.hosts.split(',');
        if (Array.isArray(sentinelHosts) && sentinelHosts.length > 2) {
            var sentinelConnections = [];

            sentinelHosts.forEach(function (item) {

                sentinelConnections.push({host: item, port: config.Redis.sentinels.port})

            })

            redisSetting = {
                sentinels: sentinelConnections,
                name: config.Redis.sentinels.name,
                password: redispass
            }

        } else {

            console.log("No enough sentinel servers found .........");
        }

    }
}

var redisClient = undefined;

if (redismode != "cluster") {
    redisClient = new redis(redisSetting);
} else {

    var redisHosts = redisip.split(",");
    if (Array.isArray(redisHosts)) {


        redisSetting = [];
        redisHosts.forEach(function (item) {
            redisSetting.push({
                host: item,
                port: redisport,
                family: 4,
                password: redispass
            });
        });

        var redisClient = new redis.Cluster([redisSetting]);

    } else {

        redisClient = new redis(redisSetting);
    }


}


var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

var async = require("async");
var reference = require('dvp-common/Reference/ReferenceGen');
var TicketTypes = require('dvp-mongomodels/model/TicketTypes').TicketTypes;

var TicketPrefix = require('dvp-mongomodels/model/Ticket').TicketPrefix;
var externalApi = require('./ExternalApiAccess.js');

////////////////////////////rabbitmq//////////////////////////////////////////////////////
//var queueHost = format('amqp://{0}:{1}@{2}:{3}', config.RabbitMQ.user, config.RabbitMQ.password, config.RabbitMQ.ip, config.RabbitMQ.port);
var rabbitmqHosts = [];
if (config.RabbitMQ.ip) {
    rabbitmqHosts = config.RabbitMQ.ip.split(",");
}

var queueConnection = amqp.createConnection({
    host: rabbitmqHosts,
    port: config.RabbitMQ.port,
    login: config.RabbitMQ.user,
    password: config.RabbitMQ.password,
    vhost: config.RabbitMQ.vhost,
    noDelay: true,
    heartbeat: 10
}, {
    reconnect: true,
    reconnectBackoffStrategy: 'linear',
    reconnectExponentialLimit: 120000,
    reconnectBackoffTime: 1000
});
queueConnection.on('ready', function () {

    logger.info("Conection with the queue is OK");

});


queueConnection.on('error', function (error) {

    logger.error("Issue in ards", error);

});
/////////////////////////////////////////////////////////////////////////////////////////////////////


SetRelatedSlots = function (req, ticketId, tags) {


    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var slotArray = [];

    FileSlotArray.find({
        company: company,
        tenant: tenant,
        tags: {$in: tags}

    }).populate('slots').exec(function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to find FileSlotArrays", false, undefined);

        }
        else {
            if (respFSlot) {

                jsonString = messageFormatter.FormatMessage(undefined, "FileSlotArrays found", true, respFSlot);

                respFSlot.forEach(function (item) {
                    item.slots.forEach(function (slot) {
                        if (slotArray.indexOf(slot) == -1) {
                            var obj =
                                {
                                    slot: {name: slot.name, fileType: slot.fileType},
                                    attachment: null
                                }

                            slotArray.push(obj);
                        }
                    });


                });

                Ticket.findOneAndUpdate({_id: ticketId}, {slot_attachment: slotArray}, function (err, tResult) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Attach slots to ticket failed", false, undefined);

                    } else {
                        if (tResult) {
                            jsonString = messageFormatter.FormatMessage(err, "Attach slots to ticket success", true, slotArray);
                        } else {
                            jsonString = messageFormatter.FormatMessage(err, "Attach slots to ticket failed", false, undefined);
                        }
                    }
                    console.log(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find FileSlotArrays", false, undefined);

            }
        }


    });

};


module.exports.CreateTicket = function (req, res) {

    logger.info("DVP-LiteTicket.CreateTicket Internal method ");


    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var dateNow = moment();

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').populate({path: 'group'})
        .exec( function (err, useraccount) {


            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);

            } else {

                var secondsDiff = moment().diff(dateNow, 'seconds');
                console.log("User pick time --- >" + secondsDiff);

                var dataNow = moment();

                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();

                    var time = new Date().toISOString();
                    var tEvent = TicketEvent({
                        type: 'status',
                        "author": req.user.iss,
                        "create_at": Date.now(),
                        body: {

                            "message": req.user.iss + " Created Ticket",
                            "time": time
                        }
                    });

                    reference.generate(company, tenant, function (done, id, key) {

                        var secondsDiff = moment().diff(dateNow, 'seconds');
                        console.log("Reference generate time --- >" + secondsDiff);


                        var ticket = Ticket({
                            created_at: Date.now(),
                            updated_at: Date.now(),
                            tid: key,
                            active: true,
                            is_sub_ticket: false,
                            type: req.body.type,
                            subject: req.body.subject,
                            reference: id,
                            description: req.body.description,
                            priority: req.body.priority,
                            status: "new",
                            submitter: useraccount.userref.id,

                            company: company,
                            tenant: tenant,
                            attachments: req.body.attachments,
                            related_tickets: req.body.related_tickets,
                            merged_tickets: req.body.merged_tickets,
                            engagement_session: req.body.engagement_session,
                            channel: req.body.channel,
                            tags: req.body.tags,
                            custom_fields: req.body.custom_fields,
                            comments: req.body.comments,
                            events: [tEvent],
                            assignee: req.body.assignee,
                            assignee_group: req.body.assignee_group,
                            due_at: req.body.due_at,
                            watchers: [user._id],
                            businessUnit: req.body.businessUnit
                        });

                        if (req.body.requester) {
                            ticket.requester = req.body.requester;
                            //ticket.watchers.push(req.body.requester);

                        }


                        /////////////////////////////ticket matrix//////////////////////
                        var matrix = {

                            created_at: ticket.created_at,
                            last_updated: ticket.created_at,
                            last_status_changed: ticket.created_at,
                            waited_time: 0,
                            worked_time: 0,
                            resolution_time: 0,
                            sla_violated: false,
                            reopens: 0,
                            replies: 0,
                            assignees: 0

                        };

                        if (req.body.assignee) {
                            matrix.assignees = 1;
                        } else {

                            matrix.assignees = 0;
                        }

                        if (req.body.assignee_group) {
                            matrix.groups = 1;
                        } else {
                            matrix.groups = 0;
                        }


                        ticket.ticket_matrix = matrix;


                        if (req.body.tags && util.isArray(req.body.tags) && req.body.tags.length > 0) {


                            var arr = [];
                            req.body.tags.forEach(function (item) {

                                var tagArr = item.split('.');
                                if (tagArr && tagArr.length > 0) {

                                    tagArr.forEach(function (myTags) {
                                        ticket.isolated_tags.push(myTags);
                                    })
                                }

                            })

                        }

                        ////////////////////////////////////////////////////////////////

                        ticket.save(function (err, client) {
                            if (err) {
                                jsonString = messageFormatter.FormatMessage(err, "Ticket create failed", false, undefined);
                            }
                            else {

                                var secondsDiff = moment().diff(dateNow, 'seconds');
                                console.log("Ticket save time --- ->" + secondsDiff);
                                //client._doc
                                jsonString = messageFormatter.FormatMessage(undefined, "Ticket saved successfully", true, client);


                                /////////////////////////////////////////recent tickets////////////////////////////////////////////////


                                if (client) {
                                    ExecuteTrigger(client.id, "change_status", "new");
                                    ExecuteCase(client);
                                    InsertUserRecentTicket(company, tenant, user._id, client.id, "create");
                                    SetRelatedSlots(req, client.id, client.isolated_tags);
                                    if (req.body.requester)
                                        AddExternalUserRecentTicket(company, tenant, req.body.requester, client.id);
                                }

                                /////////////////////////////////////////////////////////////////////////////////////////////////////

                                ////////////////////////////////////////add note to engagement session async//////////////////////////
                                try {
                                    EngagementSession.findOneAndUpdate({
                                        engagement_id: req.body.engagement_session,
                                        company: company,
                                        tenant: tenant
                                    }, {
                                        $addToSet: {
                                            notes: {
                                                body: '#TID ' + ticket.reference,
                                                author: req.user.iss,
                                                created_at: Date.now(),
                                            }
                                        }
                                    }, function (err, notes) {
                                        if (err) {

                                            logger.error("Append Note To EngagementSession Failed", err);

                                        } else {

                                            logger.debug("Append Note To EngagementSession Success");

                                        }

                                    });
                                } catch (excep) {

                                    logger.error("Append Note To EngagementSession Failed", excep);
                                }


                                //////////////////////////////////////////////////////////////////////////////////////////////////////
                                ExecuteSla(client.id, undefined);


                            }
                            res.end(jsonString);
                        });
                    });

                } else {

                    jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                    res.end(jsonString);
                }
            }
        });
};

module.exports.GetAllTickets = function (req, res) {

    logger.info("DVP-LiteTicket.GetAllTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    var qObj = {company: company, tenant: tenant, active: true};

    if (req.query.status) {
        var paramArr;
        if (Array.isArray(req.query.status)) {
            paramArr = req.query.status;
        } else {

            paramArr = [req.query.status];
        }
        qObj.status = {$in: paramArr};
    }

    if (req.query.businessunit) {
        qObj.$or = [{businessUnit: req.query.businessunit}, {businessUnit: null}];
        //qObj.businessUnit = req.query.businessunit;
    }

    var sortQuery = {};

    if (req.query.sorted_by) {

        sortQuery[req.query.sorted_by] = -1;

    } else {
        sortQuery = {created_at: -1}
    }

    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }

    Ticket.find(qObj).populate('assignee', 'name avatar firstname lastname').populate('assignee_group', 'name')
        .populate('requester', 'name avatar firstname lastname phone email landnumber facebook twitter linkedin googleplus')
        .populate('submitter', 'name avatar firstname lastname')
        .populate('collaborators', 'name avatar firstname lastname')
        .populate({path: 'form_submission', populate: {path: 'form'}}).skip(skip)
        .limit(size).sort(sortQuery).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });

};

module.exports.GetTicketSchema = function (req, res) {

    logger.info("DVP-LiteTicket.GetAllTickets Internal method ");
    //var company = parseInt(req.user.company);
    //var tenant = parseInt(req.user.tenant);

    // var userList = [];
    //var groupList = [];
    var objList = [];

    //////////////////////get users/////////////////////////////////////////////////////////////////////////////
    // User.find({company: company, tenant: tenant}).select({"username":1, "_id":1}).exec(function(err, users) {
    //
    //
    //     if(!err && users){
    //         userList = users;
    //     }
    //
    //     UserGroup.find({company: company, tenant: tenant}).select({"name":1, "_id":1}).exec(function (err, groups) {
    //
    //         if (!err && groups) {
    //             groupList = groups;
    //         }

    ///////////////////////////////////////get schema nad loop//////////////////////////////////////
    Object.keys(Ticket.schema.paths).forEach(function (key) {
        console.log(key);
        console.log(Ticket.schema.paths[key]);

        var item = {

            field: key,
            type: Ticket.schema.paths[key].instance,
        };

        if (Ticket.schema.paths[key].instance == 'ObjectID' && Ticket.schema.paths[key].options && Ticket.schema.paths[key].options.ref) {

            // if(Ticket.schema.paths[key].options.ref == 'User'){

            item["type"] = "ObjectID";
            item["reference"] = Ticket.schema.paths[key].options.ref;

            // }else if(Ticket.schema.paths[key].options.ref == 'UserGroup'){

            //     item["type"] = "Select";
            //     item["values"] = groupList;
            //}
        }

        if (Ticket.schema.paths[key].enumValues && Ticket.schema.paths[key].enumValues.length > 0) {
            item["type"] = "Select";
            item["values"] = Ticket.schema.paths[key].enumValues;
        }

        objList.push(item);
    });
    var jsonString = messageFormatter.FormatMessage(undefined, "Get Schema worked", true, objList);
    res.end(jsonString);
    //     });
    //
    // });

//////////////////////get groups////////////////////////////////////////////////////////////////////////////


};

module.exports.GetTicketsByTimeRange = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketsByTimeRange Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        "created_at": {"$gte": req.params.fromDate, "$lt": req.params.toDate}
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj, function (err, tickets) {
        //db.posts.find( //query today up to tonight  {"created_on": {"$gte": new Date(2012, 7, 14), "$lt": new Date(2012, 7, 15)}})
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Tickets By TimeRange Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get Tickets By TimeRange Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsWithStatus = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsWithStatus Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    var qObj = {company: company, tenant: tenant, active: true, status: req.params.status};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get AllTickets With Status Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get AllTickets With Status Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

            }
        }
        res.end(jsonString);
    });
};

module.exports.GetAllTicketsWithStatusTimeRange = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsWithStatusTimeRange Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        "created_at": {"$gte": req.params.fromDate, "$lt": req.params.toDate}
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get AllTickets With Status Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get AllTickets With Status Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

            }
        }
        res.end(jsonString);
    });
};

module.exports.GetAllTicketsWithMatrix = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    var qObj = {company: company, tenant: tenant, active: true};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }

    TicketStatics.find().populate({
        path: 'ticket',
        match: qObj
    }).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });

};

module.exports.GetAllTicketsInStatusWithMatrix = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var status = req.params.status;
    var jsonString;

    var qObj = {company: company, tenant: tenant, active: true, status: status};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    TicketStatics.find().populate({
        path: 'ticket',
        match: qObj
    }).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByChannel = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByChannel Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    var qObj = {company: company, tenant: tenant, channel: req.params.Channel, active: true};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Channel Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByChannelTimeRange = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByChannelTimeRange Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        "created_at": {"$gte": req.params.fromDate, "$lt": req.params.toDate},
        active: true
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Channel Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByRequester = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByRequester Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        requester: mongoose.Types.ObjectId(req.params.Requester),
        active: true
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }

    Ticket.find(qObj).populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus').populate('submitter', 'name avatar').populate('assignee', 'name avatar').skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Requester Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByRequesterTimeRange = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByRequesterTimeRange Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        "created_at": {"$gte": req.params.fromDate, "$lt": req.params.toDate},
        active: true
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Requester Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByPriority = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByPriority Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    var qObj = {company: company, tenant: tenant, priority: req.params.Priority, active: true};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Priority Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllTicketsByPriorityTimeRange = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsByPriorityTimeRange Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        "created_at": {"$gte": req.params.fromDate, "$lt": req.params.toDate},
        active: true
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Priority Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAllGroupTickets = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllGroupTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    var qObj = {company: company, tenant: tenant, assignee_group: req.params.GroupId, active: true};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }
    Ticket.find(qObj).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Group ID Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};


module.exports.GetMyGroupTicketList = function (req, res) {
    logger.info("DVP-LiteTicket.GetMyGroupTicketList Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    UserAccount.findOne({
        username: req.user.iss,
        company: company,
        tenant: tenant
    }).populate('userref', '-password')
        .exec(function (err, user) {

            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);

            } else {

                if (user && user.userref && user.group) {

                    var obj = {

                        "company": company,
                        "tenant": tenant,
                        "assignee_group": user.group,
                        "active": true
                    }
                    if (req.query.businessunit) {
                        obj.businessUnit = req.query.businessunit;
                    }
                    if(req.query.channel && req.query.channel.toLowerCase()!="all")
                    {
                        obj.channel=req.query.channel;
                    }

                    Ticket.find(obj).populate('assignee', 'name avatar firstname lastname')
                        .populate('assignee', 'name avatar')
                        .populate('assignee_group', 'name')
                        .populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus')
                        .populate('submitter', 'name').populate('collaborators', 'name')
                        .skip(skip)
                        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets and Status Failed", false, undefined);

                        } else {

                            if (tickets) {
                                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Group ID and Status Successful", true, tickets);
                            } else {

                                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, tickets);
                            }
                        }
                        res.end(jsonString);
                    });


                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No User Found", false, undefined);
                    res.end(jsonString);
                }
            }
        });
};

module.exports.GetAllMyTickets = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllMyTickets Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
        .exec( function (err, useraccount) {

            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);

            } else {

                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();

                    var qObj = {
                        company: company,
                        tenant: tenant, active: true,
                        assignee: user._id,
                    };

                    var sortQuery = {};

                    if (req.query.sorted_by) {

                        sortQuery[req.query.sorted_by] = -1;

                    } else {
                        sortQuery = {created_at: -1}
                    }

                    if (req.query.status) {
                        var paramArr;
                        if (Array.isArray(req.query.status)) {
                            paramArr = req.query.status;
                        } else {

                            paramArr = [req.query.status];
                        }

                        qObj.status = {$in: paramArr}
                    }
                    if (req.query.businessunit) {
                        qObj.businessUnit = req.query.businessunit;
                    }
                    if(req.query.channel && req.query.channel.toLowerCase()!="all")
                    {
                        qObj.channel=req.query.channel;
                    }

                    Ticket.find(qObj
                    ).populate('assignee', 'name avatar firstname lastname').populate('assignee_group', 'name').populate('requester', 'name avatar firstname lastname phone email landnumber facebook twitter linkedin googleplus').populate('submitter', 'name avatar firstname lastname').populate('collaborators', 'name avatar firstname lastname').skip(skip)
                        .limit(size).sort(sortQuery).exec(function (err, tickets) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (tickets) {
                                jsonString = messageFormatter.FormatMessage(undefined, "Find Tickets", true, tickets);
                            }
                            else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                            }
                            res.end(jsonString);
                        }
                    });


                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                    res.end(jsonString);
                }
            }
        });
};

module.exports.GetAllMyGroupTickets = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllGroupTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, user) {


        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (user && user.group) {

                var obj = {

                    "company": company,
                    "tenant": tenant,
                    "assignee_group": user.group,
                    "active": true
                };

                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    obj.status = {$in: paramArr}
                }

                var sortQuery = {};

                if (req.query.sorted_by) {

                    sortQuery[req.query.sorted_by] = -1;

                } else {
                    sortQuery = {created_at: -1}
                }
                if (req.query.businessunit) {
                    obj.businessUnit = req.query.businessunit;
                }

                Ticket.find(obj).populate('assignee', 'name avatar firstname lastname')
                    .populate('assignee_group', 'name avatar firstname lastname')
                    .populate('requester', 'name avatar firstname lastname phone email landnumber facebook twitter linkedin googleplus')
                    .populate('submitter', 'name avatar firstname lastname')
                    .populate('collaborators', 'avatar firstname lastname')
                    .skip(skip)
                    .limit(size).sort(sortQuery).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Get All Tickets and Status Failed", false, undefined);

                    } else {

                        if (tickets) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Group ID and Status Successful", true, tickets);
                        } else {

                            jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });


            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No User Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.GetAllTicketSummeryByRequester = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllMyTickets Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;


    var qObj = {
        company: company,
        tenant: tenant, active: true,
        requester: mongoose.Types.ObjectId(req.params.requester),
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj, {_id: true, subject: true, reference: true}, function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets", false, undefined);
            res.end(jsonString);
        }
        else {
            if (tickets) {
                jsonString = messageFormatter.FormatMessage(undefined, "Find Tickets", true, tickets);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
            }
            res.end(jsonString);
        }
    });


};

module.exports.GetAllMyTicketsWithStatus = function (req, res) {

    logger.debug("DVP-LiteTicket.GetAllMyTicketsWithStatus Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
        .exec( function (err, useraccount) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);

            } else {

                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();

                    var qObj = {
                        company: company,
                        tenant: tenant, active: true,
                        submitter: user._id,
                        status: req.params.status
                    };
                    if (req.query.businessunit) {
                        qObj.businessUnit = req.query.businessunit;
                    }

                    Ticket.find(qObj).skip(skip)
                        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (tickets) {
                                jsonString = messageFormatter.FormatMessage(undefined, "Find Tickets", true, tickets);
                            }
                            else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                            }
                            res.end(jsonString);
                        }
                    })
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                    res.end(jsonString);
                }
            }
        });
};

module.exports.GetTicket = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.findOne(qObj).populate('assignee', 'name avatar firstname lastname').populate('submitter', 'name avatar').populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus').sort({created_at: -1}).exec(function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
        }
        else {
            if (ticket) {
                jsonString = messageFormatter.FormatMessage(undefined, "Find Ticket", true, ticket);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
            }
        }
        res.end(jsonString);


    });


};

module.exports.GetTicketByIds = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketByIds Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: {$in: req.params.ids}
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj).populate('assignee', 'name avatar firstname lastname').populate('submitter', 'name avatar').populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus').sort({created_at: -1}).exec(function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets", false, undefined);
        }
        else {
            if (ticket) {
                jsonString = messageFormatter.FormatMessage(undefined, "Find Tickets", true, ticket);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Tickets", false, undefined);
            }
        }
        res.end(jsonString);


    });


};


module.exports.GetRecentTicket = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketView Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
        .exec( function (err, useraccount) {

            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
            else {
                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();


                    RecentUserTicket.find({
                        company: company,
                        tenant: tenant,
                        user: user._id
                    }).populate('ticket').sort({"updated_at": -1}).limit(10).exec(function (err, resent) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Failed", false, undefined);
                            res.end(jsonString);
                        } else {

                            var resentTicketList = {};

                            resentTicketList.tickets = [];

                            if (Array.isArray(resent)) {

                                resent.forEach(function (obj) {

                                    resentTicketList.tickets.push(obj.ticket);

                                })

                            }

                            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Success", true, resentTicketList);
                            res.end(jsonString);
                        }
                    });


                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                    res.end(jsonString);
                }
            }
        });

}

module.exports.GetRecentTicketx = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketView Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
        .exec( function (err, useraccount) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
            else {
                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();


                    RecentTicket.findOne({
                        company: company,
                        tenant: tenant,
                        user: user._id
                    }).populate('tickets').exec(function (err, resent) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Failed", false, undefined);
                            res.end(jsonString);
                        } else {
                            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Success", true, resent);
                            res.end(jsonString);
                        }
                    });


                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                    res.end(jsonString);
                }
            }
        });

}

module.exports.GetExternalUSerRecentTicket = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketView Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    ExternalUserRecentTicket.findOne({
        company: company,
        tenant: tenant,
        user: req.params.id
    }).populate('tickets').exec(function (err, resent) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "Get Recent Ticket Success", true, resent);
            res.end(jsonString);
        }
    });


}

module.exports.MapTicketToProfile = function (req, res) {
    logger.info("DVP-LiteTicket.MapTicketToProfile Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var time = new Date().toISOString();
    var jsonString;
    Ticket.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    }, function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {
                if (ticket.requester) {
                    jsonString = messageFormatter.FormatMessage(undefined, "Already Map To Profile", false, undefined);
                    res.end(jsonString);
                }
                else {
                    ticket.requester = req.params.Requester;
                    ticket.updated_at = time;


                    ticket.save(function (ex, obj) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                        } else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Successfully Map.", true, obj);
                        }
                        res.end(jsonString);
                    });
                }
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                res.end(jsonString);
            }
        }

    })
};



module.exports.GetTicketWithDetails = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketWithDetails Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.findOne(qObj).populate('attachments')
        .populate({path: 'sub_tickets', populate: {path: 'assignee', select: 'name avatar firstname lastname'}})
        .populate({path: 'sub_tickets', populate: {path: 'assignee_group', select: 'name'}})
        .populate({path: 'related_tickets', populate: {path: 'assignee', select: 'name avatar firstname lastname'}})
        .populate({path: 'related_tickets', populate: {path: 'assignee_group', select: 'name'}})
        .populate('assignee', 'name avatar firstname lastname ')
        .populate('assignee_group', 'name')
        .populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus contacts firstname lastname')
        .populate('submitter', 'name avatar firstname lastname')
        .populate('collaborators', 'name avatar firstname lastname')
        .populate({path: 'merged_tickets', populate: {path: 'assignee', select: 'name avatar'}})
        .populate({path: 'merged_tickets', populate: {path: 'assignee_group', select: 'name'}})
        .populate('engagement_session')
        .populate({path: 'form_submission', populate: {path: 'form'}})
        .populate({
            path: 'comments',
            populate: [{path: 'author', select: 'name avatar firstname lastname'}, {
                path: 'author_external',
                select: 'name avatar firstname lastname'
            }, {path: 'attachments'}, {path: 'engagement_session'}]
        })
        .populate({path: 'slot_attachment.attachment', populate: 'file url type'})


        .exec(function (err, ticket) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                res.end(jsonString);
            }
            else {
                if (ticket) {
                    jsonString = messageFormatter.FormatMessage(undefined, "Ticket found", true, ticket);

                    try {

                        if(ticket.assignee && ticket.assignee._id)
                        {
                            UserAccount.findOne({userref: ticket.assignee._id, company: company, tenant: tenant}).populate('group').exec(function (errAssgn, resAssgn) {

                                if(resAssgn && resAssgn.group)
                                {
                                    ticket.assignee.group = resAssgn.group._id;
                                }

                                UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
                                    .exec( function (err, useraccount) {
                                        if (err) {
                                            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                                            res.end(jsonString);

                                        } else {
                                            if (useraccount && useraccount.userref) {

                                                var user = useraccount.userref.toObject();



                                                InsertUserRecentTicket(company, tenant, user._id, ticket.id, "get");


                                                if (ticket.comments) {
                                                    var commentArray = ticket.comments.filter(function (comment) {
                                                        var updatedComment;
                                                        if (!(comment.public === 'private' && comment.author.id !== user._id)) {
                                                            updatedComment = comment;
                                                        }
                                                        else {
                                                            comment.body = "Content unavailable";
                                                            updatedComment = comment;
                                                        }
                                                        return updatedComment;
                                                    });

                                                    ticket.comments = commentArray;

                                                    jsonString = messageFormatter.FormatMessage(undefined, "Ticket found", true, ticket);
                                                    res.end(jsonString);
                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Ticket found, But no comment object found", true, ticket);
                                                    res.end(jsonString);
                                                }


                                            }
                                            else
                                            {
                                                jsonString = messageFormatter.FormatMessage(new Error("No user Account found"), "No user Account found", false, undefined);
                                                res.end(jsonString);

                                            }
                                        }
                                    });

                            });
                        }
                        else
                        {
                            UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password')
                                .exec( function (err, useraccount) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                                        res.end(jsonString);

                                    } else {
                                        if (useraccount && useraccount.userref) {

                                            var user = useraccount.userref.toObject();



                                            InsertUserRecentTicket(company, tenant, user._id, ticket.id, "get");


                                            if (ticket.comments) {
                                                var commentArray = ticket.comments.filter(function (comment) {
                                                    var updatedComment;
                                                    if (!(comment.public === 'private' && comment.author.id !== user._id)) {
                                                        updatedComment = comment;
                                                    }
                                                    else {
                                                        comment.body = "Content unavailable";
                                                        updatedComment = comment;
                                                    }
                                                    return updatedComment;
                                                });

                                                ticket.comments = commentArray;

                                                jsonString = messageFormatter.FormatMessage(undefined, "Ticket found", true, ticket);
                                                res.end(jsonString);
                                            }
                                            else {
                                                jsonString = messageFormatter.FormatMessage(undefined, "Ticket found, But no comment object found", true, ticket);
                                                res.end(jsonString);
                                            }


                                        }
                                        else
                                        {
                                            jsonString = messageFormatter.FormatMessage(new Error("No user Account found"), "No user Account found", false, undefined);
                                            res.end(jsonString);

                                        }
                                    }
                                });
                        }







                        /*var funcArr=[];

                         funcArr.push(loadComments.bind(req.user.iss,company,tenant,ticket));
                         funcArr.push(loadAssigneeData.bind(company,tenant,ticket));

                         async.parallel(funcArr,function (err,result) {

                         if(err)
                         {

                         }
                         else
                         {

                         }
                         });*/
                    }

                    catch (exe) {

                        logger.error(exe);
                        jsonString = messageFormatter.FormatMessage(exe, "Error in user search", false, undefined);

                    }

                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);

                }
            }

        })
};

module.exports.DeActivateTicket = function (req, res) {
    logger.debug("DVP-LiteTicket.DeActivateTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    Ticket.findOne({
        _id: req.params.id, company: company,
        tenant: tenant
    }, function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {

                        "message": req.user.iss + " Deactivate Ticket",
                        "time": time
                    }
                });


                ticket.update({
                    "$set": {
                        "updated_at": time,
                        "active": false
                    },
                    "$addToSet": {"events": tEvent}
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To DeActivate Ticket", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket DeActivated", true, undefined);
                            ExecuteTrigger(req.params.id, "change_status", "closed");
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, undefined);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.PickTicket = function (req, res) {
    logger.debug("DVP-LiteTicket.PickTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    Ticket.findOne({
        company: company,
        tenant: tenant,
        _id: req.params.id
    }).populate('assignee', '-password').populate('assignee_group').exec(function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {
                if (ticket.assignee) {
                    jsonString = messageFormatter.FormatMessage(undefined, "Already Assign To User.", false, undefined);
                    res.end(jsonString);
                }
                else {
                    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                            res.end(jsonString);

                        } else {
                            if (useraccount && useraccount.userref) {

                                var user = useraccount.userref.toObject();

                                var oldTicket = deepcopy(ticket.toJSON());
                                var assigneeGroup = deepcopy(ticket.toJSON().assignee_group);
                                var time = new Date().toISOString();
                                //ticket.assignee_group = undefined;
                                ticket.assignee = user._id;
                                ticket.updated_at = time;
                                var tEvent = TicketEvent({
                                    type: 'status',
                                    "author": req.user.iss,
                                    "create_at": Date.now(),
                                    body: {

                                        "message": req.user.iss + " Pick Ticket From Group " + assigneeGroup,
                                        "time": time
                                    }
                                });
                                ticket.events.push(tEvent);

                                ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                                if (ticket.ticket_matrix) {
                                    ticket.ticket_matrix.last_assigned = time;
                                    ticket.ticket_matrix.last_updated = time;

                                    if (ticket.ticket_matrix.assignees)
                                        ticket.ticket_matrix.assignees += 1;
                                    else
                                        ticket.ticket_matrix.assignees = 1;
                                }

                                ///////////////////////////////////////////////////////////////////////////////////////////////////////


                                ticket.save(function (err, rUser) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Pick Ticket", false, undefined);
                                    }
                                    else {
                                        if (rUser) {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Pick Successfully", true, ticket);
                                            ExecuteTrigger(req.params.id, "change_assignee", "");
                                            SendTicketNotification(rUser, "assignuser", req.user.iss);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, ticket);
                                        }
                                    }
                                    res.end(jsonString);
                                });
                            }
                            else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                                res.end(jsonString);
                            }
                        }
                    });
                }
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.GetTicketAudit = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketAudit Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.findOne(qObj, '_id requester events', function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
        }
        else {
            if (ticket) {
                jsonString = messageFormatter.FormatMessage(undefined, "Find Ticket", true, ticket);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
            }
        }
        res.end(jsonString);
    })

};

module.exports.UpdateTicket = function (req, res) {

    logger.debug("DVP-LiteTicket.UpdateTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    Ticket.findOne({company: company, tenant: tenant, _id: req.params.id}, function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {

                var oldTicket = deepcopy(ticket.toJSON());

                var time = new Date().toISOString();
                ticket.updated_at = time;
                ticket.subject = req.body.subject;
                ticket.description = req.body.description;
                //ticket.priority = req.body.priority;
                //ticket.type = req.body.type;
                //ticket.attachments = req.body.attachments;
                //ticket.sub_tickets = req.body.sub_tickets;
                //ticket.related_tickets = req.body.related_tickets;
                //ticket.merged_tickets = req.body.merged_tickets;
                //ticket.engagement_session = req.body.engagement_session;
                //ticket.channel = req.body.channel;
                /*ticket.tags = req.body.tags;*/
                //ticket.custom_fields = req.body.custom_fields;
                //ticket.form_submission = req.body.form_submission;
                /*ticket.comments = req.body.comments;*/

                var differences = diff(oldTicket, ticket.toJSON());

                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " made changes",
                        "time": time,
                        "differences": differences
                    }
                });
                ticket.events.push(tEvent);


                ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                if (ticket.ticket_matrix) {
                    ticket.ticket_matrix.last_updated = time;
                }

                ///////////////////////////////////////////////////////////////////////////////////////////////////////


                ticket.save(function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Update Successfully", true, rUser);
                            SendTicketNotification(ticket, "contentupdate", req.user.iss);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, rUser);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.UpdateFormSubmission = function (req, res) {

    logger.debug("DVP-LiteTicket.FormSubmission Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    Ticket.findOne({company: company, tenant: tenant, _id: req.params.id}, function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {

                var oldTicket = deepcopy(ticket.toJSON());

                var time = new Date().toISOString();
                ticket.updated_at = time;
                ticket.form_submission = req.body.form_submission;

                var differences = diff(oldTicket, ticket.toJSON());

                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " made changes",
                        "time": time,
                        "differences": differences
                    }
                });
                ticket.events.push(tEvent);
                ticket.updated_at = time;

                ticket.save(function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Update Successfully", true, rUser);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, rUser);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.AddCommentByEngagement = function (req, res) {


    logger.info("DVP-LiteTicket.AddCommentByEngagement Internal method ");
    //console.log("Request "+JSON.stringify(req));

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var author = req.user.iss;

    try {
        if (req.body.author)
            author = req.body.author;
        console.log("Author " + author);
    } catch (exx) {

    }

    Ticket.findOne({
        company: company,
        tenant: tenant,
        engagement_session: req.params.engagementid
    }, function (err, ticket) {
        if (err) {
            console.log("No ticket found for engagement " + req.params.engagementid + " checking comments for engagement");
            //////////////////////////////////////check for comment/////////////////////////////////////////////////////////
            Comment.findOne({engagement_session: req.params.engagementid}, function (err, comment) {
                if (err) {
                    console.log("No ticket or parent comment found for engagement " + req.params.engagementid);
                    jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
                    res.end(jsonString);
                }
                else {
                    console.log("No ticket by parent comment found for engagement " + req.params.engagementid);
                    if (comment) {
                        UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                            if (err) {
                                console.log("Error searching user to add comment " + req.body.author);
                                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                                res.end(jsonString);
                            }
                            else {
                                if (useraccount && useraccount.userref) {

                                    var user = useraccount.userref.toObject();
                                    var comment = Comment({
                                        body: req.body.body,
                                        body_type: req.body.body_type,
                                        type: req.body.type,
                                        public: req.body.public,
                                        author: user._id,
                                        author_external: req.body.author_external,
                                        attachments: req.body.attachments,
                                        channel: req.body.channel,
                                        channel_from: req.body.channel_from,
                                        engagement_session: req.body.engagement_session,
                                        created_at: Date.now(),
                                        meta_data: req.body.meta_data
                                    });

                                    logger.debug("Object to save as a comment is" + comment);
                                    comment.save(function (err, obj) {
                                        if (err) {
                                            console.log("Error in saving comment for eng.session " + req.body.engagement_session._id);
                                            jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                            res.end(jsonString);
                                        }
                                        else {
                                            console.log("Comment saved for eng.session " + req.body.engagement_session._id);
                                            if (obj.id) {
                                                Comment.findOneAndUpdate({_id: req.params.commentid},
                                                    {$addToSet: {sub_comment: obj.id}}
                                                    , function (err, rOrg) {
                                                        if (err) {
                                                            console.log("Comment updating failed for eng.session, sub comment " + obj.id);
                                                            jsonString = messageFormatter.FormatMessage(err, "Fail To Map Sub-Comment With Comment.", false, undefined);
                                                        } else {
                                                            if (rOrg) {
                                                                console.log("Comment updated for eng.session, sub comment " + obj.id);
                                                                jsonString = messageFormatter.FormatMessage(undefined, "Sub-Comment Successfully Save", true, obj);
                                                            }
                                                            else {
                                                                console.log("Invalid comment ID");
                                                                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Comment ID.", true, obj);
                                                            }
                                                        }
                                                        res.end(jsonString);
                                                    });
                                            }
                                            else {
                                                console.log("Fail To Save Comment");
                                                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                                res.end(jsonString);
                                            }
                                        }

                                    });
                                }
                                else {
                                    console.log("Get User Failed");
                                    jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                                    res.end(jsonString);
                                }
                            }
                        });

                    }
                    else {
                        console.log("Fail To Find Parent Comment");
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
                        res.end(jsonString);
                    }
                }

            });

            ////////////////////////////////////////////////////////////////////////////////////////////////////////////////


            //jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            //res.end(jsonString);
        }
        else {
            if (ticket) {
                console.log("Ticket found for engagement " + req.params.engagementid + " checking User");
                UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                    if (err) {
                        console.log("Ticket found for engagement " + req.params.engagementid + " No User found");
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (useraccount && useraccount.userref) {

                            var user = useraccount.userref.toObject();

                            var comment = Comment({
                                body: req.body.body,
                                body_type: req.body.body_type,
                                type: req.body.type,
                                public: req.body.public,
                                author: user._id,
                                author_external: req.body.author_external,
                                attachments: req.body.attachments,
                                channel: req.body.channel,
                                channel_from: req.body.channel_from,
                                engagement_session: req.body.engagement_session,
                                created_at: Date.now(),
                                meta_data: req.body.meta_data
                            });

                            logger.debug("Object to save as a comment is" + comment);
                            comment.save(function (err, obj) {
                                if (err) {
                                    console.log("Ticket found for engagement " + req.params.engagementid + " Comment save failed");
                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (obj.id) {
                                        console.log("Ticket found for engagement " + req.params.engagementid + " Comment saved");
                                        /////////////////////////////////////////////////////////////////////////////////////////////////////////

                                        var time = new Date().toISOString();
                                        ticket.updated_at = time;
                                        ticket.comments.push(obj.id);
                                        var tEvent = TicketEvent({
                                            type: 'status',
                                            "author": req.user.iss,
                                            "create_at": Date.now(),
                                            body: {
                                                "message": req.user.iss + " Make Comment " + obj.id,
                                                "time": time
                                            }
                                        });
                                        ticket.events.push(tEvent);


                                        /////////////////////////////////ticket matrix///////////////////////////////////////
                                        if (ticket.ticket_matrix) {
                                            ticket.ticket_matrix.last_updated = time;
                                            ticket.ticket_matrix.last_commented = time;

                                            if (comment.author_external) {

                                                if (ticket.ticket_matrix.external_replies)
                                                    ticket.ticket_matrix.external_replies += 1;
                                                else
                                                    ticket.ticket_matrix.external_replies = 1;

                                            } else {
                                                if (ticket.ticket_matrix.replies)
                                                    ticket.ticket_matrix.replies += 1;
                                                else
                                                    ticket.ticket_matrix.replies = 1;

                                                if (ticket.collaborators && util.isArray(ticket.collaborators)) {

                                                    if (ticket.collaborators.indexOf(user._id) == -1) {
                                                        ticket.collaborators.push(user._id);
                                                    }
                                                } else {
                                                    ticket.collaborators = [user._id];
                                                }
                                            }
                                        }

                                        //ticket.comments.push(obj.id);
                                        /////////////////////////////////ticket matrix///////////////////////////////////////


                                        ticket.save(function (err, rOrg) {
                                            if (err) {
                                                console.log("Ticket Updation failed");
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                            } else {
                                                if (rOrg) {
                                                    console.log("Ticket Updation succeeded");
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Comment Successfully Attach To Ticket", true, obj);
                                                }
                                                else {
                                                    console.log("Ticket Updation failed,invalid ticket id ");
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                                }
                                            }
                                            res.end(jsonString);
                                        });
                                    }
                                    else {
                                        console.log("Ticket found,Fail To Save Comment");
                                        jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                        res.end(jsonString);
                                    }
                                }

                            });
                        }
                        else {
                            console.log("Ticket found,Get User Failed");
                            jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });
            }
            else {
                //////////////////////////////////////check for comment/////////////////////////////////////////////////////////
                Comment.findOne({engagement_session: req.params.engagementid}, function (err, comment) {
                    if (err) {
                        console.log("No Ticket found for engagement " + req.params.engagementid + " checking comment failed");
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found");
                        if (comment) {
                            UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                                if (err) {
                                    console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Invalid user");
                                    jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (useraccount && useraccount.userref) {

                                        var user = useraccount.userref.toObject();
                                        var comment = Comment({
                                            body: req.body.body,
                                            body_type: req.body.body_type,
                                            type: req.body.type,
                                            public: req.body.public,
                                            author: user._id,
                                            author_external: req.body.author_external,
                                            attachments: req.body.attachments,
                                            channel: req.body.channel,
                                            channel_from: req.body.channel_from,
                                            engagement_session: req.body.engagement_session,
                                            created_at: Date.now(),
                                            meta_data: req.body.meta_data
                                        });

                                        comment.save(function (err, obj) {
                                            if (err) {
                                                console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving failed");
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                                res.end(jsonString);
                                            }
                                            else {

                                                if (obj.id) {
                                                    console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded");
                                                    Comment.findOneAndUpdate({engagement_session: req.params.engagementid},
                                                        {$addToSet: {sub_comment: obj.id}}
                                                        , function (err, rOrg) {
                                                            if (err) {
                                                                console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded,Parent comment updation failed");
                                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map Sub-Comment With Comment.", false, undefined);
                                                            } else {
                                                                if (rOrg) {
                                                                    console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded,Parent comment updation succeeded");
                                                                    jsonString = messageFormatter.FormatMessage(undefined, "Sub-Comment Successfully Save", true, obj);

                                                                    Ticket.findOneAndUpdate({comments: {'$in': [rOrg.id]}}, {$addToSet: {comments: obj.id}}, function (err, comm) {

                                                                        if (err) {
                                                                            console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded,Parent comment updation succeeded, Error updating ticket");
                                                                            jsonString = messageFormatter.FormatMessage(undefined, "Sub-Comment Successfully Save but failed to push ticket", true, obj);
                                                                        } else {
                                                                            console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded,Parent comment updation succeeded, Ticket updated");
                                                                            jsonString = messageFormatter.FormatMessage(undefined, "Sub-Comment Successfully Save", true, obj);

                                                                        }

                                                                        res.end(jsonString);

                                                                    });
                                                                }
                                                                else {
                                                                    console.log("No Ticket found for engagement " + req.params.engagementid + " Comment found, Sub comment saving succceded,Parent comment updation failed, invalid comment id,");
                                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Comment ID.", true, obj);
                                                                    res.end(jsonString);
                                                                }
                                                            }

                                                        });
                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                                    res.end(jsonString);
                                                }
                                            }

                                        });
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                                        res.end(jsonString);
                                    }
                                }
                            });

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
                            res.end(jsonString);
                        }
                    }

                });

                ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

            }
        }
    });


}


//////////////////////////////////////external method//////////////////////////////////////////////


module.exports.CreateSlotArray = function (req, res) {

    logger.info("DVP-LiteTicket.CreateSlotArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var fileSlotArray = FileSlotArray({
        company: company,
        tenant: tenant,
        tags: req.body.tags,
        name: req.body.name
    });

    fileSlotArray.save(function (err, response) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "File Slot saving failed ", false, undefined);
            res.end(jsonString);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "File Slot saving succeeded ", true, response);
            res.end(jsonString);
        }
    });

};

module.exports.GetSlotArrays = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketSlots Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FileSlotArray.find({
        company: company,
        tenant: tenant

    }, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to find FileSlotArrays", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "FileSlotArrays found", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find FileSlotArrays", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.GetSlotArray = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketSlotArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FileSlotArray.findOne({
        company: company,
        tenant: tenant,
        name: req.params.name

    }).populate('slots').exec(function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to find FileSlotArrays", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "FileSlotArrays found", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find FileSlotArrays", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.DeleteSlotArray = function (req, res) {

    logger.info("DVP-LiteTicket.DeleteSlotArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FileSlotArray.findOneAndRemove({
        company: company,
        tenant: tenant,
        name: req.params.name

    }, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to find FileSlotArrays", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "FileSlotArrays found", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find FileSlotArrays", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.AddSlotToArray = function (req, res) {

    logger.info("DVP-LiteTicket.AddSlotToArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    FileSlotArray.findOneAndUpdate({
        company: company,
        tenant: tenant,
        name: req.params.name

    }, {
        $addToSet: {
            slots: {
                name: req.body.name,
                fileType: req.body.fileType

            }
        }
    }, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to add FileSlot to Array", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "FileSlot added to Array ", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To add FileSlot to Array", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.RemoveSlotFromArray = function (req, res) {

    logger.info("DVP-LiteTicket.DeleteSlotArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    FileSlotArray.findOneAndUpdate({
        company: company,
        tenant: tenant,
        name: req.params.name

    }, {

        $pull: {slots: {"name": req.params.slotname}}

    }, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to find FileSlotArrays", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "FileSlotArrays found", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find FileSlotArrays", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.TicketAddAtachmentSlot = function (req, res) {
    logger.info("DVP-LiteTicket.AddSlotToArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    Ticket.update({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id,
        'slot_attachment.slot.name': req.params.slot,

    }, {$set: {'slot_attachment.$.attachment': req.params.attachment}}, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to add FileSlot to Array", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "Attachment added to slot ", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Attachment add to slot failed", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

module.exports.TicketDeleteAtachmentSlot = function (req, res) {
    logger.info("DVP-LiteTicket.AddSlotToArray Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    Ticket.update({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id,
        'slot_attachment.slot.name': req.params.slot,

    }, {$unset: {'slot_attachment.$.attachment': 1}}, function (err, respFSlot) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail to add FileSlot to Array", false, undefined);
        }
        else {
            if (respFSlot) {
                jsonString = messageFormatter.FormatMessage(undefined, "Attachment added to slot ", true, respFSlot);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Attachment add to slot failed", false, undefined);
            }
        }
        res.end(jsonString);
    });

};

//////////////////////////////////////external method//////////////////////////////////////////////

module.exports.AddCommentByReference = function (req, res) {


    logger.info("DVP-LiteTicket.AddCommentByReference Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var author = req.user.iss;

    try {
        if (req.body.author)
            author = req.body.author;
    } catch (exx) {

    }

    Ticket.findOne({
        company: company,
        tenant: tenant,
        reference: req.params.reference
    }, function (err, ticket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {
                UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (useraccount && useraccount.userref) {

                            var user = useraccount.userref.toObject();
                            var comment = Comment({
                                body: req.body.body,
                                body_type: req.body.body_type,
                                type: req.body.type,
                                public: req.body.public,
                                author: user._id,
                                author_external: req.body.author_external,
                                attachments: req.body.attachments,
                                channel: req.body.channel,
                                channel_from: req.body.channel_from,
                                engagement_session: req.body.engagement_session,
                                created_at: Date.now(),
                                meta_data: req.body.meta_data
                            });

                            if (req.body.author) {

                                comment.author = req.body.author;
                            }

                            logger.debug("Object to save as a comment is" + comment);
                            comment.save(function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (obj.id) {
                                        /////////////////////////////////////////////////////////////////////////////////////////////////////////

                                        var time = new Date().toISOString();
                                        ticket.updated_at = time;
                                        ticket.comments.push(obj.id);
                                        var tEvent = TicketEvent({
                                            type: 'status',
                                            "author": req.user.iss,
                                            "create_at": Date.now(),
                                            body: {
                                                "message": req.user.iss + " Make Comment " + obj.id,
                                                "time": time
                                            }
                                        });
                                        ticket.events.push(tEvent);


                                        /////////////////////////////////ticket matrix///////////////////////////////////////
                                        if (ticket.ticket_matrix) {
                                            ticket.ticket_matrix.last_updated = time;
                                            ticket.ticket_matrix.last_commented = time;

                                            if (comment.author_external) {

                                                if (ticket.ticket_matrix.external_replies)
                                                    ticket.ticket_matrix.external_replies += 1;
                                                else
                                                    ticket.ticket_matrix.external_replies = 1;

                                            } else {
                                                if (ticket.ticket_matrix.replies)
                                                    ticket.ticket_matrix.replies += 1;
                                                else
                                                    ticket.ticket_matrix.replies = 1;

                                                if (ticket.collaborators && util.isArray(ticket.collaborators)) {

                                                    if (ticket.collaborators.indexOf(user._id) == -1) {
                                                        ticket.collaborators.push(user._id);
                                                    }
                                                } else {
                                                    ticket.collaborators = [user._id];
                                                }
                                            }
                                        }

                                        /////////////////////////////////ticket matrix///////////////////////////////////////

                                        //////////////////////ticket attachments//////////////////////////////////////////////
                                        if (req.body.attachments && req.body.attachments.length > 0) {

                                            if (!ticket.attachments)
                                                ticket.attachments = [];


                                            req.body.attachments.forEach(function (at) {
                                                ticket.attachments.push(at);
                                            });
                                        }
                                        /////////////////////////////////////////////////////////////////////////////////////////////////

                                        ///////////////////ticket status///////////////////////////////////////////////////////////////
                                        if (req.body.status) {
                                            GetAvailableTicketTypes(company, tenant, function (msg, types) {

                                                if (types && types.length > 0 && types.indexOf(req.body.status) > -1) {

                                                    ticket.status = req.body.status;

                                                }

                                                ticket.save(function (err, rOrg) {
                                                    if (err) {
                                                        jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                                    } else {
                                                        if (rOrg) {
                                                            jsonString = messageFormatter.FormatMessage(undefined, "Comment Successfully Attach To Ticket", true, obj);
                                                            ExecuteTrigger(req.params.id, "add_comment", comment);
                                                        }
                                                        else {
                                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                                        }
                                                    }
                                                    res.end(jsonString);
                                                });

                                            });
                                        } else {

                                            ticket.save(function (err, rOrg) {
                                                if (err) {
                                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                                } else {
                                                    if (rOrg) {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Comment Successfully Attach To Ticket", true, obj);
                                                        ExecuteTrigger(req.params.id, "add_comment", comment);
                                                    }
                                                    else {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                                    }
                                                }
                                                res.end(jsonString);
                                            });

                                        }

                                        ///////////////////////////////////////////////////////////////////////////////////////////////


                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                        res.end(jsonString);
                                    }
                                }

                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });
            }
            else {
                //////////////////////////////////////check for comment/////////////////////////////////////////////////////////
                jsonString = messageFormatter.FormatMessage(err, "No Ticket found", false, undefined);
                res.end(jsonString);
                ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

            }
        }
    });


}

module.exports.AddComment = function (req, res) {
    logger.info("DVP-LiteTicket.AddComment Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {

                UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (useraccount && useraccount.userref) {

                            var user = useraccount.userref.toObject();

                            console.log(user);

                            var comment = Comment({
                                body: req.body.body,
                                body_type: req.body.body_type,
                                type: req.body.type,
                                public: req.body.public,
                                author: user._id,
                                author_external: req.body.author_external,
                                attachments: req.body.attachments,
                                channel_from: req.body.channel_from,
                                engagement_session: req.body.engagement_session,
                                created_at: new Date().toISOString(),
                                meta_data: req.body.meta_data
                            });

                            console.log(comment);

                            if (req.body.channel) {
                                comment.channel = req.body.channel;
                            }

                            comment.save(function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (obj && obj.id) {

                                        ////////////////////////////////////////////////////////////////////////////////////////////////////////

                                        if (req.body.public == 'public') {

                                            var queueName;
                                            var message = {
                                                from: req.body.channel_from,
                                                to: req.body.channel_to,
                                                body: req.body.body,
                                                comment: comment._id,
                                                update_comment: true,
                                                reply_session: req.body.reply_session,
                                                attachments: req.body.attachments,
                                                company: company,
                                                tenant: tenant,
                                                author: req.user.iss,
                                                imageUrl: req.body.imageUrl
                                            };

                                            if (req.body.channel == 'twitter') {
                                                queueName = 'TWEETOUT';
                                            } else if (req.body.channel == 'sms') {
                                                queueName = 'SMSOUT';
                                            } else if (req.body.channel == 'email') {
                                                queueName = 'EMAILOUT';
                                            } else if (req.body.channel == 'facebook-post') {
                                                queueName = 'FACEBOOKOUT';

                                                if (req.body.contact && req.body.contact && req.body.contact.raw && req.body.contact.raw.id) {

                                                    message.from = req.body.contact.raw.id;
                                                }

                                            } else if (req.body.channel == 'facebook-chat') {
                                                queueName = 'FACEBOOKOUT';
                                                if (req.body.contact && req.body.contact && req.body.contact.raw && req.body.contact.raw.id) {

                                                    message.from = req.body.contact.raw.id;
                                                }

                                            } else {
                                                //   jsonString = messageFormatter.FormatMessage(undefined, "Given channel doesn,t support public comments", false, undefined);
                                                //   res.end(jsonString);
                                                //   return;
                                            }
                                            try {

                                                if (queueName)
                                                    queueConnection.publish(queueName, message, {
                                                        contentType: 'application/json'
                                                    });
                                            } catch (exp) {

                                                console.log(exp);
                                            }
                                        }


                                        /////////////////////////////////////////////////////////////////////////////////////////////////////////


                                        var time = new Date().toISOString();
                                        ticket.updated_at = time;
                                        ticket.comments.push(obj.id);
                                        var tEvent = TicketEvent({
                                            type: 'status',
                                            "author": req.user.iss,
                                            "create_at": Date.now(),
                                            body: {
                                                "message": req.user.iss + " Make Comment " + obj.id,
                                                "time": time
                                            }
                                        });
                                        ticket.events.push(tEvent);


                                        /////////////////////////////////ticket matrix///////////////////////////////////////
                                        if (ticket.ticket_matrix) {
                                            ticket.ticket_matrix.last_updated = time;
                                            ticket.ticket_matrix.last_commented = time;

                                            if (comment.author_external) {

                                                if (ticket.ticket_matrix.external_replies)
                                                    ticket.ticket_matrix.external_replies += 1;
                                                else
                                                    ticket.ticket_matrix.external_replies = 1;

                                            } else {
                                                if (ticket.ticket_matrix.replies)
                                                    ticket.ticket_matrix.replies += 1;
                                                else
                                                    ticket.ticket_matrix.replies = 1;


                                                if (ticket.collaborators && util.isArray(ticket.collaborators)) {

                                                    if (ticket.collaborators.indexOf(user._id) == -1) {
                                                        ticket.collaborators.push(user._id);
                                                    }
                                                } else {
                                                    ticket.collaborators = [user._id];
                                                }
                                            }
                                        }


                                        /////////////////////////////////ticket matrix///////////////////////////////////////

                                        ticket.save(function (err, rOrg) {
                                            if (err) {
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                            } else {
                                                if (rOrg) {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Comment Successfully Attach To Ticket", true, obj);
                                                    ExecuteTrigger(req.params.id, "add_comment", comment);

                                                    if (req.body.public == 'public' || req.body.public == 'internal') {
                                                        SendTicketNotification(ticket, "comment", req.user.iss)
                                                    }


                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                                }
                                            }
                                            res.end(jsonString);
                                        });
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                        res.end(jsonString);
                                    }
                                }

                            });

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });

            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });


};

module.exports.UpdateComment = function (req, res) {
    logger.info("DVP-LiteTicket.UpdateComment Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Comment.findOneAndUpdate({_id: req.params.id}, req.body, function (err, comment) {

        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Comment Update Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Comment Update successfully", true, comment);
            res.end(jsonString);
        }
    });
};

module.exports.AddAttachment = function (req, res) {
    logger.info("DVP-LiteTicket.AddAttachment Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {
                UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    } else {

                        if (useraccount && useraccount.userref) {

                            var user = useraccount.userref.toObject();


                            var attachment = Attachment({
                                file: req.body.file,
                                url: req.body.url,
                                type: req.body.type,
                                size: req.body.size
                            });

                            attachment.save(function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Save Attachment.", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (obj.id) {

                                        var time = new Date().toISOString();
                                        ticket.updated_at = time;
                                        ticket.attachments.push(obj.id);
                                        var tEvent = TicketEvent({
                                            type: 'status',
                                            "author": req.user.iss,
                                            "create_at": Date.now(),
                                            body: {
                                                "message": req.user.iss + " Add Attachment " + obj.id,
                                                "time": time
                                            }
                                        });
                                        ticket.events.push(tEvent);


                                        ///////////////////////////////////ticket matrix////////////////////////////////
                                        if (ticket.ticket_matrix) {
                                            ticket.ticket_matrix.last_updated = time;
                                        }

                                        /////////////////////////////////////////////////////////////////////////////////////////

                                        ticket.save(function (err, rOrg) {
                                            if (err) {
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                            } else {
                                                if (rOrg) {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Attachment Successfully Map To Ticket", true, obj);
                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                                }
                                            }
                                            res.end(jsonString);
                                        });
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Attachment.", false, undefined);
                                        res.end(jsonString);
                                    }
                                }

                            });
                        } else {

                            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });


};

module.exports.RemoveAttachment = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveAttachment Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({_id: req.params.tid, company: company, tenant: tenant}, function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {

                Attachment.findOneAndRemove({_id: req.params.id}, function (err, obj) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Delete Attachment.", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (obj && obj.id) {

                            var time = new Date().toISOString();
                            ticket.updated_at = time;

                            var index = ticket.attachments.indexOf(obj.id);
                            if (index > -1) {
                                ticket.attachments.splice(index, 1);
                            }

                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Removed Attachment " + obj.id,
                                    "time": time
                                }
                            });
                            ticket.events.push(tEvent);


                            ///////////////////////////////////ticket matrix////////////////////////////////
                            if (ticket.ticket_matrix) {
                                ticket.ticket_matrix.last_updated = time;
                            }

                            /////////////////////////////////////////////////////////////////////////////////////////

                            ticket.save(function (err, rOrg) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Ticket.", false, undefined);
                                } else {
                                    if (rOrg) {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Attachment Successfully Map To Ticket", true, obj);
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj);
                                    }
                                }
                                res.end(jsonString);
                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Attachment.", false, undefined);
                            res.end(jsonString);
                        }
                    }

                });
            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AddCommentToComment = function (req, res) {
    logger.info("DVP-LiteTicket.AddCommentToComment Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    Comment.findById(req.params.commentid, function (err, comment) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
            res.end(jsonString);
        }
        else {
            if (comment) {
                Ticket.findOne({
                    _id: req.params.id,
                    company: company,
                    tenant: tenant
                }, function (err, ticket) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (ticket) {
                            UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    if (useraccount && useraccount.userref) {

                                        var user = useraccount.userref.toObject();



                                        var comment = Comment({
                                            body: req.body.body,
                                            body_type: req.body.body_type,
                                            type: req.body.type,
                                            public: req.body.public,
                                            author: user._id,
                                            author_external: req.body.author_external,
                                            attachments: req.body.attachments,
                                            channel: req.body.channel,
                                            channel_from: req.body.channel_from,
                                            engagement_session: req.body.engagement_session,
                                            created_at: new Date().toISOString(),
                                            meta_data: req.body.meta_data
                                        });

                                        comment.save(function (err, obj) {
                                            if (err) {
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Save Comment", false, undefined);
                                                res.end(jsonString);
                                            }
                                            else {
                                                if (obj.id) {


                                                    ////////////////////////////////////////////////////////////////////////////////////////////////////////
                                                    if (req.body.public == 'public') {

                                                        var queueName;

                                                        var message = {
                                                            from: req.body.channel_from,
                                                            to: req.body.channel_to,
                                                            body: req.body.body,
                                                            comment: comment._id,
                                                            updatecomment: true,
                                                            reply_session: req.body.reply_session,
                                                            company: company,
                                                            tenant: tenant,
                                                            author: req.user.iss
                                                        };

                                                        if (req.body.channel == 'twitter') {
                                                            queueName = 'TWEETOUT';
                                                        } else if (req.body.channel == 'sms') {
                                                            queueName = 'SMSOUT';
                                                        }
                                                        if (req.body.channel == 'email') {
                                                            queueName = 'EMAILOUT';
                                                        } else if (req.body.channel == 'facebook-post') {
                                                            queueName = 'FACEBOOKOUT';

                                                            if (req.body.contact && req.body.contact && req.body.contact.raw && req.body.contact.raw.id) {

                                                                message.from = req.body.contact.raw.id;
                                                            }
                                                        } else if (req.body.channel == 'facebook-chat') {
                                                            queueName = 'FACEBOOKOUT';

                                                            if (req.body.contact && req.body.contact && req.body.contact.raw && req.body.contact.raw.id) {

                                                                message.from = req.body.contact.raw.id;
                                                            }
                                                        } else {
                                                            //jsonString = messageFormatter.FormatMessage(undefined, "Given channel doesn,t support public comments", false, undefined);
                                                            //res.end(jsonString);
                                                            //return;
                                                        }

                                                        queueConnection.publish(queueName, message, {
                                                            contentType: 'application/json'
                                                        });
                                                    }

                                                    /////////////////////////////////////////////////////////////////////////////////////////////////////////

                                                    Comment.findOneAndUpdate({_id: req.params.commentid},
                                                        {$addToSet: {sub_comment: obj.id}}
                                                        , function (err, rOrg) {
                                                            if (err) {
                                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map Sub-Comment With Comment.", false, undefined);
                                                            } else {
                                                                if (rOrg) {
                                                                    jsonString = messageFormatter.FormatMessage(undefined, "Sub-Comment Successfully Save", true, obj);
                                                                    ExecuteTrigger(req.params.id, "add_comment", comment);
                                                                }
                                                                else {
                                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Comment ID.", true, obj);
                                                                }
                                                            }
                                                            res.end(jsonString);
                                                        });


                                                    var time = new Date().toISOString();
                                                    ticket.updated_at = time;
                                                    var tEvent = TicketEvent({
                                                        type: 'status',
                                                        "author": req.user.iss,
                                                        "create_at": Date.now(),
                                                        body: {
                                                            "message": req.user.iss + " Make Comment To Comment " + obj.id,
                                                            "time": time
                                                        }
                                                    });
                                                    ticket.events.push(tEvent);


                                                    /////////////////////////////////////ticket matrix//////////////////////////////////
                                                    if (ticket.ticket_matrix) {
                                                        ticket.ticket_matrix.last_updated = time;
                                                        ticket.ticket_matrix.last_commented = time;

                                                        if (comment.author_external) {

                                                            if (ticket.ticket_matrix.external_replies)
                                                                ticket.ticket_matrix.external_replies += 1;
                                                            else
                                                                ticket.ticket_matrix.external_replies = 1;

                                                        } else {
                                                            if (ticket.ticket_matrix.replies)
                                                                ticket.ticket_matrix.replies += 1;
                                                            else
                                                                ticket.ticket_matrix.replies = 1;

                                                            if (ticket.collaborators && util.isArray(ticket.collaborators)) {

                                                                if (ticket.collaborators.indexOf(user._id) == -1) {
                                                                    ticket.collaborators.push(user._id);
                                                                }
                                                            } else {
                                                                ticket.collaborators = [user._id];
                                                            }

                                                        }
                                                    }

                                                    //////////////////////////////////////////////////////////////////////////////////////

                                                    ticket.save(function (ex, nTick) {
                                                        if (err) {
                                                            jsonString = messageFormatter.FormatMessage(err, "Ticket Updated Fail", false, undefined);
                                                        } else {
                                                            jsonString = messageFormatter.FormatMessage(err, "Ticket Updated", true, undefined);
                                                        }
                                                    })
                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Comment", false, undefined);
                                                    res.end(jsonString);
                                                }
                                            }

                                        });
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                                        res.end(jsonString);
                                    }

                                }
                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(err, "Fail To Find Comment", false, undefined);
                res.end(jsonString);
            }
        }

    });


};

module.exports.ChangeStatus = function (req, res) {
    logger.debug("DVP-LiteTicket.ChangeStatus Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    if (req.body.status) {
        Ticket.findOne({company: company, tenant: tenant, _id: req.params.id},function (err, ticket) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                res.end(jsonString);
            }
            else {
                if (ticket) {
                    var oldTicket = deepcopy(ticket.toJSON());
                    var old_state = ticket.status;
                    ticket.status = req.body.status;

                    ValidateStatusChangeRequest(tenant, company, ticket.type, old_state, req.body.status, function (response) {

                        var validatedResponse = JSON.parse(response);
                        if (validatedResponse && validatedResponse.IsSuccess) {
                            var time = new Date().toISOString();
                            ticket.updated_at = time;
                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Status Update ",
                                    "time": time
                                }
                            });
                            ticket.events.push(tEvent);

                            ///////////////////////////////////ticket matrix////////////////////////////////
                            if (ticket.ticket_matrix) {
                                ticket.ticket_matrix.last_updated = time;

                                if (ticket.status == 'open') {

                                    if (old_state != 'new') {

                                        ticket.ticket_matrix.reopens = ticket.ticket_matrix.reopens + 1;
                                    }
                                    else {
                                        ticket.ticket_matrix.opened_at = time;
                                        ticket.ticket_matrix.waited_time = time - ticket.ticket_matrix.created_at;
                                    }

                                } else if (ticket.status == 'closed' || ticket.status == 'solved') {

                                    ticket.ticket_matrix.solved_at = time;
                                    ticket.ticket_matrix.resolution_time = time - ticket.ticket_matrix.created_at;
                                }

                                ticket.ticket_matrix.last_status_changed = time;

                            }

                            /////////////////////////////////////////////////////////////////////////////////////////


                            if (ticket.sub_tickets.length > 0 && req.body.status == "closed") {
                                Ticket.find({
                                    id: {
                                        $in: ticket.sub_tickets.map(function (o) {
                                            return ObjectId(o);
                                        })
                                    }, status: "closed"
                                }, function (err, docs) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail To Check Sub Ticket Status.", false, undefined);
                                        res.end(jsonString);
                                    }
                                    else {
                                        if (docs && (ticket.sub_tickets.length == docs.length)) {


                                            ticket.save(function (err, rUser) {
                                                if (err) {
                                                    jsonString = messageFormatter.FormatMessage(err, "Fail Update Status.", false, undefined);
                                                }
                                                else {
                                                    if (rUser) {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Status Update Successfully", true, rUser);
                                                        ExecuteTrigger(req.params.id, "change_status", oldTicket.status);

                                                        SendTicketNotification(ticket, "status", req.user.iss);
                                                    }
                                                    else {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, rUser);
                                                    }
                                                }
                                                res.end(jsonString);
                                            });
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Sub Ticket Not Completed.", false, undefined);
                                            res.end(jsonString);
                                        }
                                    }
                                });

                            }
                            else {

                                Ticket.findOneAndUpdate({
                                    _id: req.params.id,
                                    company: company,
                                    tenant: tenant
                                }, ticket, function (err, rUser) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket", false, undefined);
                                    }
                                    else {
                                        if (rUser) {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Status Update Successfully", true, rUser);
                                            ExecuteTrigger(req.params.id, "change_status", oldTicket.status);
                                            SendTicketNotification(ticket, "status", req.user.iss);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, rUser);
                                        }
                                    }
                                    res.end(jsonString);
                                });
                            }
                        } else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Status Change Request", false, undefined);
                            res.end(jsonString);
                        }
                    });


                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                    res.end(jsonString);
                }
            }

        });
    }
    else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Status.", false, undefined);
        res.end(jsonString);
    }

};

module.exports.ChangeStatusByUser = function (req, res) {
    logger.debug("DVP-LiteTicket.ChangeStatusByUser Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    if (req.body.status && req.body.user) {

        // UserAccount.findOne({userref: req.body.user, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, user) {

        // User.findOne({_id: req.body.user, company: company, tenant: tenant}, function (err, user) {


        Ticket.findOne({
            company: company,
            tenant: tenant,
            reference: req.params.reference,
            assignee: mongoose.Types.ObjectId(req.body.user)
        }).populate('assignee', '-password').exec(function (err, ticket) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                res.end(jsonString);
            }
            else {
                if (ticket) {
                    var oldTicket = deepcopy(ticket.toJSON());
                    var old_state = ticket.status;
                    ticket.status = req.body.status;

                    ValidateStatusChangeRequest(tenant, company, ticket.type, old_state, req.body.status, function (response) {

                        var validatedResponse = JSON.parse(response);
                        if (validatedResponse && validatedResponse.IsSuccess) {
                            var time = new Date().toISOString();
                            ticket.updated_at = time;
                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": ticket.assignee.username,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Status Update ",
                                    "time": time
                                }
                            });
                            ticket.events.push(tEvent);

                            ///////////////////////////////////ticket matrix////////////////////////////////
                            if (ticket.ticket_matrix) {
                                ticket.ticket_matrix.last_updated = time;

                                if (ticket.status == 'open') {

                                    if (old_state != 'new') {

                                        ticket.ticket_matrix.reopens = ticket.ticket_matrix.reopens + 1;
                                    }
                                    else {
                                        ticket.ticket_matrix.opened_at = time;
                                        ticket.ticket_matrix.waited_time = time - ticket.ticket_matrix.created_at;
                                    }

                                } else if (ticket.status == 'closed' || ticket.status == 'solved') {

                                    ticket.ticket_matrix.solved_at = time;
                                    ticket.ticket_matrix.resolution_time = time - ticket.ticket_matrix.created_at;
                                }

                                ticket.ticket_matrix.last_status_changed = time;

                            }

                            /////////////////////////////////////////////////////////////////////////////////////////


                            if (ticket.sub_tickets.length > 0 && req.body.status == "closed") {
                                Ticket.find({
                                    id: {
                                        $in: ticket.sub_tickets.map(function (o) {
                                            return ObjectId(o);
                                        })
                                    }, status: "closed"
                                }, function (err, docs) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail To Check Sub Ticket Status.", false, undefined);
                                        res.end(jsonString);
                                    }
                                    else {
                                        if (docs && (ticket.sub_tickets.length == docs.length)) {


                                            ticket.save(function (err, rUser) {
                                                if (err) {
                                                    jsonString = messageFormatter.FormatMessage(err, "Fail Update Status.", false, undefined);
                                                }
                                                else {
                                                    if (rUser) {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Status Update Successfully", true, rUser);
                                                        ExecuteTrigger(req.params.id, "change_status", oldTicket.status);
                                                    }
                                                    else {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, rUser);
                                                    }
                                                }
                                                res.end(jsonString);
                                            });
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Sub Ticket Not Completed.", false, undefined);
                                            res.end(jsonString);
                                        }
                                    }
                                });

                            }
                            else {

                                Ticket.findOneAndUpdate({
                                    reference: req.params.reference,
                                    company: company,
                                    tenant: tenant
                                }, ticket, function (err, rUser) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket", false, undefined);
                                    }
                                    else {
                                        if (rUser) {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Status Update Successfully", true, rUser);
                                            ExecuteTrigger(req.params.id, "change_status", oldTicket.status);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, rUser);
                                        }
                                    }
                                    res.end(jsonString);
                                });
                            }
                        } else {

                            var queueName = "EMAILOUT";
                            var message = {
                                from: "no-reply",
                                to: ticket.assignee.email.contact,
                                subject: "Resp:" + req.params.reference + " status update request " + req.body.status,
                                //template: "By-User Registration Confirmation",
                                body: "The status is invalid",
                                company: 0,
                                tenant: 1
                            }

                            queueConnection.publish(queueName, message, {
                                contentType: 'application/json'
                            });


                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Status Change Request", false, undefined);
                            res.end(jsonString);
                        }
                    });

                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                    res.end(jsonString);
                }
            }

        });
        //});
    }
    else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Status.", false, undefined);
        res.end(jsonString);
    }

};

module.exports.AssignToUser = function (req, res) {
    logger.info("DVP-LiteTicket.AssignToUser Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    if (req.params.user) {

        UserAccount.findOne({userref: req.params.user, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
            //User.findOne({_id: req.params.user, company: company, tenant: tenant}, function (err, user) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            } else {
                if (useraccount && useraccount.userref) {

                    var user = useraccount.userref.toObject();
                    Ticket.findOne({
                        company: company,
                        tenant: tenant,
                        _id: req.params.id
                    }).populate('assignee', '-password').populate('assignee_group').exec(function (err, ticket) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (ticket) {

                                var oldTicket = deepcopy(ticket.toJSON());
                                var time = new Date().toISOString();

                                var tEvent = TicketEvent({
                                    type: 'status',
                                    "author": req.user.iss,
                                    "create_at": Date.now(),
                                    body: {
                                        "message": req.user.iss + " Ticket Assign To User " + user.name,
                                        "time": time
                                    }
                                });


                                ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                                if (ticket.ticket_matrix) {
                                    ticket.ticket_matrix.last_assigned = time;
                                    ticket.ticket_matrix.last_updated = time;


                                    if (ticket.ticket_matrix.assignees)
                                        ticket.ticket_matrix.assignees += 0;
                                    else
                                        ticket.ticket_matrix.assignees = 1;
                                }

                                ///////////////////////////////////////////////////////////////////////////////////////////////////////


                                //ticket.assignee = user._id;
                                ticket.assignee = user;
                                ticket.updated_at = time;
                                ticket.$addToSet = {"events": tEvent};


                                ticket.save(function (err, obj) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                                    } else {
                                        if (obj) {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Assign To User.", true, undefined);
                                            var PreAssignee = oldTicket.assignee ? oldTicket.assignee.username : "";
                                            ExecuteTrigger(req.params.id, "change_assignee", PreAssignee);

                                            SendTicketNotification(ticket, "assignuser", req.user.iss);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket Information.", false, undefined);
                                        }
                                    }
                                    res.end(jsonString);
                                });

                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                                res.end(jsonString);
                            }
                        }
                    });
                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Unable To Find User.", false, undefined);
                    res.end(jsonString);
                }
            }
        });
    }
    else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid User Info.", false, undefined);
        res.end(jsonString);
    }

};

module.exports.AssignToGroup = function (req, res) {
    logger.info("DVP-LiteTicket.AssignToGroup Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    if (req.params.group) {
        UserGroup.findOne({_id: req.params.group, company: company, tenant: tenant}, function (err, group) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get Group Failed", false, undefined);
                res.end(jsonString);
            } else {
                if (group) {
                    Ticket.findOne({
                        company: company,
                        tenant: tenant,
                        _id: req.params.id
                    }).populate('assignee', '-password').populate('assignee_group').exec(function (err, ticket) {
                        if (err) {
                            jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (ticket) {
                                var oldTicket = deepcopy(ticket.toJSON());
                                var time = new Date().toISOString();
                                ticket.updated_at = time;
                                var tEvent = TicketEvent({
                                    type: 'status',
                                    "author": req.user.iss,
                                    "create_at": Date.now(),
                                    body: {
                                        "message": req.user.iss + " Ticket Assign To Group " + group.name,
                                        "time": time
                                    }
                                });
                                /*ticket.events.push(tEvent);
                                 ticket.assignee_group = group.id;
                                 ticket.assignee = undefined ;*/

                                ticket.assignee_group = group;
                                ticket.assignee = undefined;
                                ticket.updated_at = time;
                                ticket.$addToSet = {"events": tEvent};


                                ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                                if (ticket.ticket_matrix) {
                                    ticket.ticket_matrix.last_assigned = time;
                                    ticket.ticket_matrix.last_updated = time;


                                    if (ticket.ticket_matrix.assignees)
                                        ticket.ticket_matrix.assignees += 1;
                                    else
                                        ticket.ticket_matrix.assignees = 1;
                                }

                                ///////////////////////////////////////////////////////////////////////////////////////////////////////


                                ticket.save(function (err, obj) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                                    }
                                    if (obj) {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Ticket Assign To Group.", true, undefined);
                                        var PreAssigneeGroup = oldTicket.assignee_group ? oldTicket.assignee_group.name : "";
                                        ExecuteTrigger(req.params.id, "change_assignee_groups", PreAssigneeGroup);
                                        SendTicketNotification(obj, "assigngroup", req.user.iss);
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket Information.", false, undefined);
                                    }
                                    res.end(jsonString);
                                });

                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Ticket", false, undefined);
                                res.end(jsonString);
                            }
                        }
                    });
                }
                else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Unable To Find User Group.", false, undefined);
                    res.end(jsonString);
                }
            }
        });
    }
    else {
        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Group Info.", false, undefined);
        res.end(jsonString);
    }
};

module.exports.GetAllTicketsBy = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllTicketsBy Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var FieldName = req.params.FieldName;
    var fieldValue = req.params.FieldValue;

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var qObj = {};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    if (FieldName == "assignee") {

        qObj.company = company;
        qObj.tenant = tenant;
        qObj.active = true;
        qObj.assignee = fieldValue;

        Ticket.find(qObj).skip(skip)
            .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get Ticket With assignee Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Get Ticket With assignee Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    else if (FieldName == "assignee_group") {

        qObj.company = company;
        qObj.tenant = tenant;
        qObj.active = true;
        qObj.assignee_group = fieldValue;

        Ticket.find(qObj).skip(skip)
            .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get Ticket With assignee_group Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Get Ticket With assignee_group Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    else if (FieldName == "submitter") {

        qObj.company = company;
        qObj.tenant = tenant;
        qObj.active = true;
        qObj.submitter = fieldValue;

        Ticket.find(qObj).skip(skip)
            .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get Ticket With submitter Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Get Ticket With submitter Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    /*else if (FieldName == "requester") {
     Ticket.find({company: company, tenant: tenant, active: true, requester: fieldValue}).skip(skip)
     .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
     if (err) {
     jsonString = messageFormatter.FormatMessage(err, "Get Ticket With assignee_group Failed", false, undefined);
     } else {
     if (tickets) {
     jsonString = messageFormatter.FormatMessage(undefined, "Get Ticket With assignee_group Successful", true, tickets);
     } else {
     jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);
     }
     }
     res.end(jsonString);
     });
     }*/
    else {
        jsonString = messageFormatter.FormatMessage(new Error("Invalid Search Category."), "Invalid Search Category.", false, undefined);
        res.end(jsonString);
    }

};

//var query = Product.find({"title": new RegExp(".*" + value.replace(/(\W)/g, "\\$1") + ".*", "i")}).limit(3);
module.exports.TicketSearch = function (req, res) {
    logger.info("DVP-LiteTicket.TicketSearch Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var searchBy = req.params.SearchBy;
    var searchValue = req.params.SearchValue;

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    if (searchBy == "subject") {
        var subject_qObj = {
            'subject': new RegExp(searchValue, 'i'), active: true,
            company: company,
            tenant: tenant
        };
        if (req.query.businessunit) {
            subject_qObj.businessUnit = req.query.businessunit;
        }

        Ticket.find(subject_qObj).skip(skip)
            .limit(size).sort({created_at: -1}).populate('submitter', 'name avatar').exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Search Tickets by Subject Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Search Tickets by Subject Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    else if (searchBy == "reference") {

        var ref_qObj = {
            'reference': new RegExp(searchValue, 'i'), active: true,
            company: company,
            tenant: tenant
        };
        if (req.query.businessunit) {
            ref_qObj.businessUnit = req.query.businessunit;
        }

        Ticket.find(ref_qObj).skip(skip)
            .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Search Tickets by Reference Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Search Tickets by Reference Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    else if (searchBy == "channel") {

        var channel_qObj = {
            'reference': new RegExp(searchValue, 'i'), active: true,
            company: company,
            tenant: tenant
        };
        if (req.query.businessunit) {
            channel_qObj.businessUnit = req.query.businessunit;
        }

        Ticket.find(channel_qObj).skip(skip)
            .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Search Tickets by channel Failed", false, undefined);

            } else {

                if (tickets) {

                    jsonString = messageFormatter.FormatMessage(undefined, "Search Tickets by channel Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No Ticket Found", false, undefined);

                }
            }
            res.end(jsonString);
        });
    }
    else {
        jsonString = messageFormatter.FormatMessage(err, "Search Category Not Implemented.", false, undefined);
        res.end(jsonString);
    }

};

module.exports.SearchTickets = function (req, res) {
    logger.debug("DVP-TicketService.SearchTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var qObj = {
        $text: {$search: req.params.text},
        company: company,
        tenant: tenant
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj, {score: {$meta: "textScore"}}).skip(skip)
        .limit(size).sort({score: {$meta: 'textScore'}})
        .populate('assignee', 'name avatar firstname lastname')
        .populate('assignee_group', 'name')
        .populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus')
        .populate('submitter', 'name avatar').populate('collaborators', 'name avatar')
        .populate({path: 'form_submission', populate: {path: 'form'}})
        .exec(function (err, tickets) {
            if (err) {

                jsonString = messageFormatter.FormatMessage(err, "Get Tickets Failed", false, undefined);

            } else {

                if (tickets) {


                    jsonString = messageFormatter.FormatMessage(err, "Get Tickets Successful", true, tickets);

                } else {

                    jsonString = messageFormatter.FormatMessage(undefined, "No External Users Found", false, undefined);

                }
            }

            res.end(jsonString);
        });
};

module.exports.MergeTicket = function (req, res) {

    logger.info("DVP-LiteTicket.MergeTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.ticketid
    }, function (err, sticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Sub Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (sticket) {
                Ticket.findOne({
                    company: company,
                    tenant: tenant,
                    active: true,
                    _id: req.params.id
                }, function (err, ticket) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (ticket) {
                            var time = new Date().toISOString();

                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Merge Ticket With " + req.params.ticketid,
                                    "time": time
                                }
                            });

                            ticket.update({
                                "$set": {
                                    "updated_at": time
                                },
                                "$addToSet": {"events": tEvent, "merged_tickets": req.params.ticketid}
                            }, function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    jsonString = messageFormatter.FormatMessage(undefined, "Merge Ticket Successfully.", true, undefined);
                                    res.end(jsonString);
                                }
                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                            res.end(jsonString);
                        }
                    }

                })
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Sub Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.GetMergeTickets = function (req, res) {
    logger.info("DVP-LiteTicket.MergeTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.findOne(qObj, function (err, sticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (sticket) {

                Ticket.find({
                        _id: {
                            $in: sticket.merged_tickets.map(function (o) {
                                return o;
                            })
                        }
                    },
                    function (err, ticket) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Fail to Find MergeTicket", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (ticket) {
                                jsonString = messageFormatter.FormatMessage(undefined, "Get Merge Ticket Successfully.", true, ticket);
                                res.end(jsonString);
                            }
                            else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find MergeTicket", false, undefined);
                                res.end(jsonString);
                            }
                        }

                    })
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.CreateSubTicket = function (req, res) {

    logger.info("DVP-LiteTicket.CreateSubTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({company: company, tenant: tenant, _id: req.params.id}, function (err, parentTicket) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        }
        else if (parentTicket) {

            UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                if (err) {

                    jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                    res.end(jsonString);

                } else {


                    if (useraccount && useraccount.userref) {

                        var user = useraccount.userref.toObject();


                        var time = new Date().toISOString();
                        var tEvent = TicketEvent({
                            type: 'status',
                            "author": req.user.iss,
                            "create_at": Date.now(),
                            body: {
                                "message": req.user.iss + " Create Sub Ticket",
                                "time": time
                            }
                        });


                        reference.generate(company, tenant, function (done, id, key) {

                            var ticket = Ticket({
                                created_at: time,
                                updated_at: time,
                                active: true,
                                is_sub_ticket: true,
                                type: req.body.type,
                                subject: req.body.subject,
                                reference: id,
                                tid: key,
                                description: req.body.description,
                                priority: req.body.priority,
                                status: "new",
                                requester: req.body.requester,
                                assignee: req.body.assignee,
                                assignee_group: req.body.assignee_group,
                                submitter: user._id,
                                company: company,
                                tenant: tenant,
                                attachments: req.body.attachments,
                                related_tickets: req.body.related_tickets,
                                merged_tickets: req.body.merged_tickets,
                                engagement_session: ObjectId(req.body.engagement_session),
                                channel: req.body.channel,
                                tags: req.body.tags,
                                custom_fields: req.body.custom_fields,
                                comments: req.body.comments,
                                events: [tEvent],
                                businessUnit: req.body.businessUnit
                            });


                            /////////////////////////////ticket matrix//////////////////////
                            var matrix = {

                                created_at: ticket.created_at,
                                last_updated: ticket.created_at,
                                last_status_changed: ticket.created_at,
                                waited_time: 0,
                                worked_time: 0,
                                resolution_time: 0,
                                sla_violated: false,
                                reopens: 0,
                                replies: 0,

                            };

                            if (req.body.assignee) {
                                matrix.assignees = 0;
                            }

                            if (req.body.assignee_group) {
                                matrix.groups = 0;
                            }


                            ticket.ticket_matrix = matrix;

                            if (req.body.tags && util.isArray(req.body.tags) && req.body.tags.length > 0) {


                                var arr = [];
                                req.body.tags.forEach(function (item) {

                                    var tagArr = item.split('.');
                                    if (tagArr && tagArr.length > 0) {

                                        tagArr.forEach(function (myTags) {
                                            ticket.isolated_tags.push(myTags);
                                        })
                                    }

                                })

                            }

                            ////////////////////////////////////////////////////////////////

                            ticket.save(function (err, obj) {
                                jsonString = messageFormatter.FormatMessage(new Error("Invalid Parent ID."), "Sub-Ticket Saved Successfully.Without Mapping To Parent.", false, ticket);
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Ticket create failed", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    SetRelatedSlots(req, obj.id, obj.isolated_tags);
                                    parentTicket.update({$addToSet: {sub_tickets: obj._doc._id}}
                                        , function (err, rOrg) {
                                            if (err) {
                                                jsonString = messageFormatter.FormatMessage(err, "Fail To Map With Parent.", false, undefined);
                                            } else {
                                                if (rOrg) {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Sub-Ticket Saved Successfully", true, obj._doc);
                                                }
                                                else {
                                                    jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", true, obj._doc);
                                                }
                                            }
                                            res.end(jsonString);
                                        });
                                }
                            });
                        });
                    } else {

                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                }
            });

        } else {
            jsonString = messageFormatter.FormatMessage(err, "Invalid Ticket ID.", false, undefined);
            res.end(jsonString);
        }
    });


};

module.exports.GetSubTickets = function (req, res) {
    logger.info("DVP-LiteTicket.GetSubTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var qObj = {company: company, tenant: tenant, is_sub_ticket: true};
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj).skip(skip)
        .limit(size).sort({created_at: -1}).exec(function (err, tickets) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Sub Tickets Failed", false, undefined);

        } else {

            if (tickets) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Sub Tickets Successful", true, tickets);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Sub Tickets Found", false, tickets);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetAttachTickets = function (req, res) {
    logger.info("DVP-LiteTicket.GetAttachTickets Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.findOne(qObj, function (err, sticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (sticket) {

                Ticket.find({
                        _id: {
                            $in: sticket.related_tickets.map(function (o) {
                                return o;
                            })
                        }
                    },
                    function (err, ticket) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
                            res.end(jsonString);
                        }
                        else {
                            if (ticket) {
                                jsonString = messageFormatter.FormatMessage(undefined, "Get Related Ticket Successfully.", true, ticket);
                                res.end(jsonString);
                            }
                            else {
                                jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Related Ticket", false, undefined);
                                res.end(jsonString);
                            }
                        }

                    })
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AttachTicket = function (req, res) {
    logger.info("DVP-LiteTicket.AttachTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.ticketid
    }, function (err, sticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (sticket) {
                Ticket.findOne({
                    company: company,
                    tenant: tenant,
                    active: true,
                    _id: req.params.id
                }, function (err, ticket) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (ticket) {
                            var time = new Date().toISOString();

                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Attach Ticket With " + req.params.ticketid,
                                    "time": time
                                }
                            });

                            ticket.update({
                                "$set": {
                                    "updated_at": time
                                },
                                "$addToSet": {"events": tEvent, "related_tickets": req.params.ticketid}
                            }, function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    jsonString = messageFormatter.FormatMessage(undefined, "Attach Ticket Successfully.", true, undefined);
                                    res.end(jsonString);
                                }
                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                            res.end(jsonString);
                        }
                    }

                })
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Related Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.DeAttachTicket = function (req, res) {
    logger.info("DVP-LiteTicket.DeAttachTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.ticketid
    }, function (err, sticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (sticket) {
                Ticket.findOne({
                    company: company,
                    tenant: tenant,
                    active: true,
                    _id: req.params.id
                }, function (err, ticket) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (ticket) {
                            var time = new Date().toISOString();

                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " Detach Ticket " + req.params.ticketid,
                                    "time": time
                                }
                            });

                            ticket.update({
                                "$set": {
                                    "updated_at": time
                                },
                                "$addToSet": {"events": tEvent},
                                "$pull": {"related_tickets": req.params.ticketid}

                            }, function (err, obj) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Fail to Find Ticket", false, undefined);
                                    res.end(jsonString);
                                }
                                else {
                                    jsonString = messageFormatter.FormatMessage(undefined, "Detach Ticket Successfully.", true, obj);
                                    res.end(jsonString);
                                }
                            });
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                            res.end(jsonString);
                        }
                    }

                })
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Related Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AppendEngagement = function (req, res) {
    logger.info("DVP-LiteTicket.AppendEngagement Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    Ticket.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (ticket) {

                var time = new Date().toISOString();

                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Append Engagement " + req.params.id,
                        "time": time
                    }
                });

                ticket.update({
                    "$set": {
                        "updated_at": time,
                        "engagement_session": req.params.EngagementId
                    },
                    "$addToSet": {"events": tEvent}

                }, function (err, rOrg) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Append Engagement to Ticket.", false, undefined);
                    } else {
                        if (rOrg) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Comment Successfully Append Engagement To Ticket", true, obj);

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, obj);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });


};

module.exports.GetTicketsByEngagementId = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketsByEngagementId Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var qObj = {
        engagement_session: req.params.EngagementId,
        company: company,
        tenant: tenant
    };
    if (req.query.businessunit) {
        qObj.businessUnit = req.query.businessunit;
    }

    Ticket.find(qObj, function (err, ticket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail To Find Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "GetTicketsByEngagementId.", true, ticket);
            res.end(jsonString);
        }
    });


};

module.exports.GetJobId = function (req, res) {
    logger.info("DVP-LiteTicket.GetJobId Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var bulkOperationObj = BulkOperation({
        company: company,
        tenant: tenant,
        JobType: req.body.JobType,
        JobReference: req.body.JobReference,
        JobStatus: 'Created',
        JobCount: 0,
        CommonData: {},
        OperationData: []
    });

    bulkOperationObj.save(function (err, bulkObj) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Job Id Failed", false, undefined);
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Get Job Id Success", true, bulkObj._id.toString());
        }
        res.end(jsonString);
    });
};

module.exports.GetAllJobs = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllJobs Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    BulkOperation.find({
        company: company,
        tenant: tenant
    }).exec(function (err, bulkOperations) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Bulk Operations", false, undefined);
            res.end(jsonString);
        }
        else {
            var bulkOperationData = bulkOperations.map(function (bulkObj) {
                return {
                    company: bulkObj.company,
                    tenant: bulkObj.tenant,
                    JobId: bulkObj._id.toString(),
                    JobType: bulkObj.JobType,
                    JobStatus: bulkObj.JobStatus,
                    JobCount: bulkObj.JobCount,
                    OperationCount: bulkObj.OperationData.length
                };
            });
            var jsonString = messageFormatter.FormatMessage(undefined, "Find Bulk Operation Success", true, bulkOperationData);
        }
        res.end(jsonString);
    });
};

module.exports.GetJobsByReference = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllJobs Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    BulkOperation.find({
        company: company,
        tenant: tenant,
        JobReference: {$in: req.query.jobReference}
    }).exec(function (err, bulkOperations) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Bulk Operations", false, undefined);
            res.end(jsonString);
        }
        else {
            var bulkOperationData = bulkOperations.map(function (bulkObj) {
                return {
                    company: bulkObj.company,
                    tenant: bulkObj.tenant,
                    JobId: bulkObj._id.toString(),
                    JobType: bulkObj.JobType,
                    JobStatus: bulkObj.JobStatus,
                    JobReference: bulkObj.JobReference,
                    JobCount: bulkObj.JobCount,
                    OperationCount: bulkObj.OperationData.length
                };
            });
            var jsonString = messageFormatter.FormatMessage(undefined, "Find Bulk Operation Success", true, bulkOperationData);
        }
        res.end(jsonString);
    });
};

module.exports.RemoveJob = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveJob Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    BulkOperation.remove({
        company: company,
        tenant: tenant,
        _id: req.params.jobId
    }).exec(function (err, bulkOperations) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Remove Bulk Operation", false, undefined);
            res.end(jsonString);
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Remove Bulk Operation Success", true, bulkOperations);
        }
        res.end(jsonString);
    });
};

module.exports.StartBulkOperationJob = function (req, res) {
    logger.info("DVP-LiteTicket.StartBulkOperationJob Internal method ");
    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);


    BulkOperation.findOne({
        company: company,
        tenant: tenant,
        _id: req.params.jobId,
        JobStatus: "uploading"
    }).exec(function (err, bulkOperation) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Bulk Operations", false, undefined);
        }
        else {
            if (bulkOperation) {
                ExecuteTriggerBulkOperation(req.params.jobId);
                jsonString = messageFormatter.FormatMessage(undefined, "Start Bulk Operation Success", true, bulkOperation);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail to Find Bulk Operations", false, undefined);
            }
        }
        res.end(jsonString);
    });
};

module.exports.BulkStatusUpdate = function (req, res) {
    logger.info("DVP-LiteTicket.BulkStatusUpdate Internal method ");

    var jsonString;
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jobId = undefined;
    var uploadStatus = undefined;
    if (req.query.jobId) {
        jobId = req.query.jobId;
    }
    if (req.query.uploadStatus) {
        uploadStatus = req.query.uploadStatus;
    }


    Ticket.find({
        company: company,
        tenant: tenant,
        active: true,
        _id: {
            $in: req.body.TicketIds
        }
    }).lean().exec(function (err, tickets) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
            res.end(jsonString);
        }
        else {
            if (tickets) {
                Ticket.update({
                    company: company,
                    tenant: tenant,
                    active: true,
                    _id: {
                        $in: req.body.TicketIds
                    }
                }, {$set: {status: req.body.Status}}, {multi: true}, function (err, sticket) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (sticket) {

                            var bulkOperations = [];

                            tickets.forEach(function (tckt) {

                                bulkOperations.push({
                                    TicketId: tckt._id.toString(),
                                    TriggerType: "change_status",
                                    TicketStatus: tckt.status
                                });


                            });


                            BulkOperation.update({
                                    _id: jobId
                                },
                                {
                                    $set: {CommonData: req.body.specificOperations},
                                    $addToSet: {OperationData: {$each: bulkOperations}},
                                    $inc: {JobCount: bulkOperations.length}
                                },
                                {multi: true}, function (err, bulkObj) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail to Update Bulk Operation", false, undefined);
                                        res.end(jsonString);
                                    }
                                    else {
                                        if (!uploadStatus || uploadStatus === 'done') {
                                            ExecuteTriggerBulkOperation(jobId);
                                        }
                                        jsonString = messageFormatter.FormatMessage(err, "Update Bulk Operation Success", true, undefined);
                                        res.end(jsonString);
                                    }
                                });

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Related Ticket ID.", false, undefined);
                            res.end(jsonString);
                        }
                    }
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Related Ticket ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.WatchTicket = function (req, res) {

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var time = new Date().toISOString();

                Ticket.findOneAndUpdate({
                    company: company,
                    tenant: tenant,
                    _id: req.params.id,
                }, {

                    $addToSet: {watchers: user._id},
                    updated_at: time

                }, function (err, recentticket) {
                    if (err) {

                        logger.error("Add to resent ticket failed ", err);
                        jsonString = messageFormatter.FormatMessage(err, "Add watcher failed", false, undefined);
                        res.end(jsonString);
                    } else {

                        logger.debug("Add to resent ticket succeed ");
                        jsonString = messageFormatter.FormatMessage(undefined, "Add watcher successful", true, undefined);
                        res.end(jsonString);
                    }

                });
            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
}

module.exports.StopWatchTicket = function (req, res) {

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();
                var time = new Date().toISOString();
                Ticket.findOneAndUpdate({
                    company: company,
                    tenant: tenant,
                    _id: req.params.id
                }, {

                    $pull: {watchers: user._id},
                    updated_at: time

                }, function (err, recentticket) {
                    if (err) {

                        logger.error("Add to resent ticket failed ", err);
                        jsonString = messageFormatter.FormatMessage(err, "Add watcher failed", false, undefined);
                        res.end(jsonString);
                    } else {

                        logger.debug("Add to resent ticket succeed ");
                        jsonString = messageFormatter.FormatMessage(undefined, "Add watcher successful", true, undefined);
                        res.end(jsonString);
                    }

                });
            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.setEstimatedTime = function (req, res) {

    console.log("Hit");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Ticket.findOneAndUpdate({
        company: company,
        tenant: tenant,
        _id: req.params.id
    }, {$set: {time_estimation: req.body.time_estimation}}, {new: true}, function (err, resTicket) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Related Ticket", false, undefined);
            res.end(jsonString);
        }
        else {

            jsonString = messageFormatter.FormatMessage(undefined, "Estimated time updated", true, resTicket);
            res.end(jsonString);
        }
    });
};

module.exports.AddCommonAttachment = function (req, res) {
    logger.info("DVP-LiteTicket.AddCommonAttachment Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var attachment = Attachment({
                    file: req.body.file,
                    url: req.body.url,
                    type: req.body.type,
                    size: req.body.size
                });

                attachment.save(function (err, obj) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Save Attachment.", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (obj.id) {

                            jsonString = messageFormatter.FormatMessage(undefined, "Attachment saved", true, obj);
                            res.end(jsonString);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Attachment.", false, undefined);
                            res.end(jsonString);
                        }
                    }

                });
            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });


};


function ExecuteTriggerSpecificOperationsAsync(ticketId, eventType, data, operations) {
    var deferred = q.defer();

    try {

        triggerWorker.ExecuteTriggerWithSpecificOperations(ticketId, eventType, data, operations, function (reply) {
            deferred.resolve(reply);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteTriggerSpecificOperationsAsync Internal method." + ticketId + " " + eventType + " " + data, jsonString, ex);
        deferred.reject(ex);
    }

    /*setTimeout(function() {
     deferred.resolve('hello world');
     }, 500);*/

    return deferred.promise;
}

function ExecuteTriggerSpecificOperations(ticketId, eventType, data, operations) {
    try {

        logger.info("DVP-LiteTicket.ExecuteTriggerSpecificOperations Internal method." + ticketId + " " + eventType + " " + data);
        ExecuteTriggerSpecificOperationsAsync(ticketId, eventType, data, operations).then(function (val) {
            logger.info("DVP-LiteTicket.ExecuteTriggerSpecificOperations Internal method. reply : " + val);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteTriggerSpecificOperations Internal method." + ticketId + " " + eventType + " " + data, jsonString, ex);
    }

}

function ExecuteTriggerBulkOperation(bulkOperationId) {
    logger.info("DVP-LiteTicket.ExecuteTriggerBulkOperation Internal method ");

    BulkOperation.findOneAndUpdate({_id: bulkOperationId}, {$set: {JobStatus: 'Running'}}, {multi: true}, function (err, bulkObj) {
        if (err) {
            logger.error("DVP-LiteTicket.ExecuteTriggerBulkOperation Internal method Err:: %s", err);
        } else {
            if (bulkObj) {

                function BatchUploader(array, executionType) {
                    var index = 0;


                    return new Promise(function (resolve, reject) {

                        function next() {
                            if (index < array.length) {
                                index++;
                                BulkOperation.update({_id: bulkOperationId}, {$pull: {OperationData: array[index]}}, {multi: true}, function (err, sticket) {
                                    //callback();
                                });
                                if (executionType === 'specific') {
                                    ExecuteTriggerSpecificOperationsAsync(array[index].TicketId, array[index].TriggerType, array[index].TicketStatus, bulkObj.CommonData).then(next, next).catch(next);

                                } else {
                                    ExecuteTriggerAsync(array[index].TicketId, array[index].TriggerType, array[index].TicketStatus).then(next, next).catch(next);

                                }
                            } else {
                                resolve();
                            }
                        }

                        next();
                    });
                }

                //var asyncTasks = [];
                if (bulkObj.CommonData && bulkObj.CommonData.length > 0) {

                    logger.info("DVP-LiteTicket.ExecuteTriggerSpecificOperations Internal method.");

                    //bulkObj.OperationData.forEach(function (ticket) {
                    //    asyncTasks.push(function(callback){
                    //
                    //        ExecuteTriggerSpecificOperationsAsync(ticket.TicketId, ticket.TriggerType, ticket.TicketStatus, bulkObj.CommonData).then(function (val) {
                    //            try {
                    //                BulkOperation.update({
                    //                    _id: bulkOperationId
                    //                }, {$pull: {OperationData: ticket}}, {multi: true}, function (err, sticket) {
                    //                    callback();
                    //                });
                    //            }catch(ex){
                    //
                    //                callback();
                    //            }
                    //        }).catch(function () {
                    //            callback();
                    //        });
                    //
                    //
                    //    });
                    //});

                    BatchUploader(bulkObj.OperationData, 'specific').then(function () {

                        console.log('Finished');

                        BulkOperation.update({
                            _id: bulkOperationId
                        }, {$set: {JobStatus: 'done', OperationData: []}}, {multi: true}, function (err, sticket) {
                            logger.info("DVP-LiteTicket.ExecuteTriggerBulkOperation: Remove Bulk Operation");
                        });
                    }, function (reason) {

                    });


                } else {

                    logger.info("DVP-LiteTicket.ExecuteTrigger Internal method.");
                    jsonString = messageFormatter.FormatMessage(undefined, "Successfully Update.", true, undefined);


                    BatchUploader(bulkObj.OperationData, 'trigger').then(function () {

                        console.log('Finished');

                        BulkOperation.update({
                            _id: bulkOperationId
                        }, {$set: {JobStatus: 'done', OperationData: []}}, {multi: true}, function (err, sticket) {
                            logger.info("DVP-LiteTicket.ExecuteTriggerBulkOperation: Remove Bulk Operation");
                        });
                    }, function (reason) {

                    });

                }

                //if(asyncTasks.length > 0) {
                //    async.parallelLimit(asyncTasks, 10, function () {
                //        console.log('Finished');
                //        BulkOperation.update({
                //            _id: bulkOperationId
                //        }, { $set: { JobStatus: 'done', OperationData: []} }, {multi: true}, function (err, sticket) {
                //            logger.info("DVP-LiteTicket.ExecuteTriggerBulkOperation: Remove Bulk Operation");
                //        });
                //
                //    });
                //}


            } else {
                logger.error("DVP-LiteTicket.ExecuteTriggerBulkOperation No Bulk Operation Found");
            }
        }
    });


}

function ExecuteSlaAsync(ticketId, previousPriority) {
    var deferred = q.defer();

    try {

        slaWorker.ExecuteSLA(ticketId, previousPriority, function (reply) {
            deferred.resolve(reply);
        })
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteSlaAsync Internal method." + ticketId, jsonString, ex);
        deferred.reject(ex);
    }

    /*setTimeout(function() {
     deferred.resolve('hello world');
     }, 500);*/

    return deferred.promise;
}

function ExecuteSla(ticketId, previousPriority) {
    try {

        logger.info("DVP-LiteTicket.ExecuteSla Internal method." + ticketId);
        ExecuteSlaAsync(ticketId, previousPriority).then(function (val) {
            logger.info("DVP-LiteTicket.ExecuteSla Internal method. reply : " + val);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteSla Internal method." + ticketId, jsonString, ex);
    }

}


function InsertUserRecentTicket(company, tenant, user, ticket, operation) {


    RecentUserTicket.findOneAndUpdate({

        user: user,
        company: company,
        tenant: tenant,
        ticket: ticket

    }, {

        $setOnInsert: {
            company: company,
            tenant: tenant,
            user: user,
            ticket: ticket,
            created_at: Date.now(),
        },
        $set: {
            updated_at: Date.now(),
            operation: operation
        }

    }, {upsert: true, new: true}, function (err, recentticket) {
        if (err) {

            logger.error("Add to resent ticket failed ", err);
        } else {

            logger.debug("Add to resent ticket succeeed ");
        }

    });

    //var resentUserTicket = RecentUserTicket({
    //    user: user,
    //    created_at: Date.now(),
    //    company: company,
    //    tenant: tenant,
    //    tickets: ticket
    //
    //});
    //
    //resentUserTicket.save(function (err, recentticket) {
    //    if (err) {
    //
    //        logger.error("Add to resent ticket failed ", err);
    //    } else {
    //
    //        logger.debug("Add to resent ticket succeeed ");
    //    }
    //
    //});
}


function AddUserRecentTicket(company, tenant, id, tid) {
    RecentTicket.findOneAndUpdate({
        company: company,
        tenant: tenant,
        user: id
    }, {

        $setOnInsert: {
            company: company,
            tenant: tenant
        },
        $push: {
            tickets: {$each: [tid], $slice: -10}
        }
    }, {upsert: true, new: true}, function (err, recentticket) {
        if (err) {

            logger.error("Add to resent ticket failed ", err);
        } else {

            logger.debug("Add to resent ticket succeeed ");
        }

    });
}

function AddExternalUserRecentTicket(company, tenant, id, tid) {
    try {
        ExternalUserRecentTicket.findOneAndUpdate({
            company: company,
            tenant: tenant,
            user: id
        }, {

            $setOnInsert: {
                company: company,
                tenant: tenant
            },
            $push: {
                tickets: {$each: [tid], $slice: -10}
            }
        }, {upsert: true, new: true}, function (err, recentticket) {
            if (err) {

                logger.error("Add to resent ticket failed ", err);
            } else {

                logger.debug("Add to resent ticket succeeed ");
            }

        });
    }
    catch (ex) {
        logger.error("Add to resent ticket failed ", ex);
    }

}

function ExecuteCaseAsync(ticket) {
    var deferred = q.defer();

    try {

        caseWorker.ExecuteCase(ticket, function (err, reply) {
            deferred.resolve(reply);
        })
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteCaseAsync Internal method." + ticket.tid, jsonString, ex);
        deferred.reject(ex);
    }

    /*setTimeout(function() {
     deferred.resolve('hello world');
     }, 500);*/

    return deferred.promise;
}

function ExecuteCase(ticket) {
    try {

        logger.info("DVP-LiteTicket.ExecuteCase Internal method." + ticket.tid);
        ExecuteCaseAsync(ticket).then(function (err, val) {
            logger.info("DVP-LiteTicket.ExecuteCase Internal method. reply : " + val);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteCase Internal method." + ticket.tid, jsonString, ex);
    }

}

function ExecuteTriggerAsync(ticketId, eventType, data) {
    var deferred = q.defer();

    try {

        triggerWorker.ExecuteTrigger(ticketId, eventType, data, function (reply) {
            deferred.resolve(reply);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteTriggerAsync Internal method." + ticketId + " " + eventType + " " + data, jsonString, ex);
        deferred.reject(ex);
    }

    /*setTimeout(function() {
     deferred.resolve('hello world');
     }, 500);*/

    return deferred.promise;
}

function ExecuteTrigger(ticketId, eventType, data) {
    try {

        logger.info("DVP-LiteTicket.ExecuteTrigger Internal method." + ticketId + " " + eventType + " " + data);
        ExecuteTriggerAsync(ticketId, eventType, data).then(function (val) {
            logger.info("DVP-LiteTicket.ExecuteTrigger Internal method. reply : " + val);
        });
    }
    catch (ex) {
        var jsonString = messageFormatter.FormatMessage(ex, "EXCEPTION", false, undefined);
        logger.error("DVP-LiteTicket.ExecuteTrigger Internal method." + ticketId + " " + eventType + " " + data, jsonString, ex);
    }

}

/* -----------------------------Case--------------------------------------------------*/

module.exports.AddCaseConfiguration = function (req, res) {
    logger.info("DVP-LiteTicket.AddCaseConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                CaseConfiguration.findOne({
                    company: company,
                    tenant: tenant,
                    active: true,
                    configurationRule: req.body.configurationRule
                }, function (err, caseConfiguration) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail to Validate Case Configuration", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (caseConfiguration) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Case Configuration already exists", false, caseConfiguration);
                            res.end(jsonString);
                        } else {
                            var time = new Date().toISOString();
                            var tEvent = TicketEvent({
                                type: 'status',
                                "author": req.user.iss,
                                "create_at": Date.now(),
                                body: {
                                    "message": req.user.iss + " CaseConfiguration",
                                    "time": time
                                }
                            });

                            var caseConfiguration = CaseConfiguration({
                                created_at: time,
                                updated_at: time,
                                active: true,
                                configurationName: req.body.configurationName,
                                description: req.body.description,
                                submitter: user._id,
                                company: company,
                                tenant: tenant,
                                configurationRule: req.body.configurationRule,
                                activeTicketTypes: req.body.activeTicketTypes,
                                configurationType: req.body.configurationType,
                                threshold: req.body.threshold,
                                events: [tEvent]
                            });

                            caseConfiguration.save(function (err, caseConfiguration) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "caseConfiguration failed", false, undefined);
                                }
                                else {
                                    if (caseConfiguration) {
                                        jsonString = messageFormatter.FormatMessage(undefined, "caseConfiguration saved successfully", true, caseConfiguration);
                                    }
                                    else {
                                        jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save caseConfiguration.", false, caseConfiguration);
                                    }
                                }
                                res.end(jsonString);
                            });
                        }
                    }
                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.EditCaseConfiguration = function (req, res) {
    logger.info("DVP-LiteTicket.EditCaseConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    CaseConfiguration.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    }, function (err, caseConfiguration) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find CaseConfiguration", false, undefined);
            res.end(jsonString);
        }
        else {
            if (caseConfiguration) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Edit CaseConfiguration",
                        "time": time
                    }
                });
                caseConfiguration.update({
                    "$set": {
                        "updated_at": Date.now(),
                        "description": req.body.description,
                        "activeTicketTypes": req.body.activeTicketTypes
                    }
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To update CaseConfiguration", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Update CaseConfiguration", true, undefined);

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Data.", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid CaseConfiguration ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.DeleteCaseConfiguration = function (req, res) {
    logger.info("DVP-LiteTicket.DeleteCaseConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    CaseConfiguration.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    }, function (err, caseConfiguration) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find CaseConfiguration", false, undefined);
            res.end(jsonString);
        }
        else {
            if (caseConfiguration) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Delete CaseConfiguration",
                        "time": time
                    }
                });
                caseConfiguration.update({
                    "$set": {
                        "updated_at": Date.now(),
                        "active": false
                    }
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Delete CaseConfiguration", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Delete CaseConfiguration", true, undefined);

                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Data.", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid CaseConfiguration ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.CreateCase = function (req, res) {
    logger.info("DVP-LiteTicket.CreateCase Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Create Case",
                        "time": time
                    }
                });

                var caseInfo = Case({
                    created_at: time,
                    updated_at: time,
                    active: true,
                    status: "new",
                    caseName: req.body.caseName,
                    description: req.body.description,
                    submitter: user._id,
                    company: company,
                    tenant: tenant,
                    attachments: req.body.attachments,
                    caseConfiguration: req.body.caseConfiguration,
                    related_tickets: req.body.relatedTickets,
                    comments: req.body.comments,
                    events: [tEvent],
                    SLAViolated: false
                });

                caseInfo.save(function (err, caseData) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Case failed", false, undefined);
                    }
                    else {
                        if (caseData) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Case saved successfully", true, caseData);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Save Case.", false, caseData);
                        }
                    }
                    res.end(jsonString);
                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.DeleteCase = function (req, res) {
    logger.info("DVP-LiteTicket.DeleteCase Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Case.findOne({
        company: company,
        tenant: tenant,
        active: true,
        _id: req.params.id
    }).populate('caseConfiguration').exec(function (err, caseData) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Fail to Find Case", false, undefined);
            res.end(jsonString);
        }
        else {
            if (caseData) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Delete Case",
                        "time": time
                    }
                });
                caseData.update({
                    "$set": {
                        "updated_at": Date.now(),
                        "active": false,
                        "status": "closed"
                    },
                    "$addToSet": {"events": tEvent}
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Delete Case", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Delete Case", true, undefined);
                            //CaseConfiguration.findOneAndUpdate({_id: caseData.caseConfiguration._id}, {active : false, updated_at : Date.now()}, function(err, org) {
                            //    if (err) {
                            //        console.log("Deactivate Case Configuration Failed");
                            //    }else{
                            //        console.log(err, "Deactivate Case Configuration Successful");
                            //    }
                            //});
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Data.", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Invalid Case ID.", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AddTicketToCase = function (req, res) {
    logger.info("DVP-LiteTicket.AddTicketToCase Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    Case.findOne({company: company, tenant: tenant, _id: req.params.id}, function (err, caseData) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail Find Case", false, undefined);
            res.end(jsonString);
        }
        else {
            if (caseData) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Add Ticket To Case " + JSON.stringify(req.body.ticketid),
                        "time": time,
                        "differences": {}
                    }
                });

                caseData.update({
                    "$set": {
                        "updated_at": Date.now()
                    },
                    "$addToSet": {"events": tEvent, "related_tickets": {$each: req.body.ticketid}}
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Case.", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Add Ticket To Case.", true, rUser);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Case ID.", false, rUser);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Case", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.RemoveTicketFromCase = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveTicketFromCase Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    Case.findOne({company: company, tenant: tenant, _id: req.params.id}, function (err, caseData) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Fail Find Case", false, undefined);
            res.end(jsonString);
        }
        else {
            if (caseData) {
                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Remove Ticket From Case " + JSON.stringify(req.body.ticketid),
                        "time": time,
                        "differences": {}
                    }
                });

                caseData.update({
                    "$set": {
                        "updated_at": Date.now()
                    },
                    "$addToSet": {"events": tEvent},
                    "$pull": {"related_tickets": {$in: req.body.ticketid}}
                }, function (err, rUser) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail To Remove Ticket.", false, undefined);
                    }
                    else {
                        if (rUser) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Remove Ticket.", true, rUser);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Case ID.", false, rUser);
                        }
                    }
                    res.end(jsonString);
                });
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Fail Find Case", false, undefined);
                res.end(jsonString);
            }
        }

    });
};

module.exports.GetCase = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCase Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    Case.findOne({
        _id: req.params.id,
        company: company,
        tenant: tenant
    }).populate('related_tickets').populate('caseConfiguration').exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Case Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get Case Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Case Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetCase = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCase Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    Case.findOne({
        _id: req.params.id,
        company: company,
        tenant: tenant
    }).populate('related_tickets').populate('caseConfiguration').exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Case Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get Case Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Case Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetCases = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCases Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    Case.find({company: company, tenant: tenant}).populate('caseConfiguration').exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Cases Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get Cases Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Cases Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetCasesWithLimit = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCases Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var tempLimit = parseInt(req.params.limit);
    var tempSkip = parseInt(req.params.skip);
    var jsonString;
    Case.find({company: company, tenant: tenant}).skip(tempSkip)
        .limit(tempLimit).populate('caseConfiguration').exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get Cases Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get Cases Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Cases Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetCaseConfiguration = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCaseConfiguration Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    CaseConfiguration.findOne({_id: req.params.id, company: company, tenant: tenant}).exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get CaseConfiguration Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get CaseConfiguration Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No CaseConfiguration Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};

module.exports.GetCaseConfigurations = function (req, res) {
    logger.debug("DVP-LiteTicket.GetCaseConfigurations Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    CaseConfiguration.find({company: company, tenant: tenant}).exec(function (err, cases) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get CaseConfigurations Failed", false, undefined);

        } else {

            if (cases) {


                jsonString = messageFormatter.FormatMessage(err, "Get CaseConfigurations Successful", true, cases);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No CaseConfigurations Found", false, undefined);

            }
        }

        res.end(jsonString);
    });
};


/* -----------------------------Case--------------------------------------------------*/

/*to Facebook App*/
module.exports.CreateTicketWithComment = function (req, res) {

    logger.info("DVP-LiteTicket.CreateTicket Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var time = new Date().toISOString();
                var tEvent = TicketEvent({
                    type: 'status',
                    "author": req.user.iss,
                    "create_at": Date.now(),
                    body: {
                        "message": req.user.iss + " Created Ticket",
                        "time": time
                    }
                });

                var ticket = Ticket({
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    active: true,
                    is_sub_ticket: false,
                    type: req.body.type,
                    subject: req.body.subject,
                    reference: req.body.reference,
                    description: req.body.description,
                    priority: req.body.priority,
                    status: "new",
                    submitter: user._id,
                    company: company,
                    tenant: tenant,
                    attachments: req.body.attachments,
                    related_tickets: req.body.related_tickets,
                    merged_tickets: req.body.merged_tickets,
                    engagement_session: req.body.engagement_session,
                    channel: req.body.channel,
                    tags: req.body.tags,
                    custom_fields: req.body.custom_fields,
                    comments: req.body.comments,
                    events: [tEvent],
                    requester: undefined,
                    assignee: req.body.assignee
                });

                if (req.body.requester)
                    ticket.requester = req.body.requester;

                /////////////////////////////ticket matrix//////////////////////
                var matrix = {
                    created_at: ticket.created_at,
                    last_updated: ticket.created_at,
                    last_status_changed: ticket.created_at,
                    waited_time: 0,
                    worked_time: 0,
                    resolution_time: 0,
                    sla_violated: false,
                    reopens: 0,
                    replies: 0,
                    assignees: 0
                };

                if (req.body.assignee) {
                    matrix.assignees = 1;
                } else {
                    matrix.assignees = 0;
                }

                if (req.body.assignee_group) {
                    matrix.groups = 1;
                } else {
                    matrix.groups = 0;
                }
                ticket.ticket_matrix = matrix;
                if (req.body.tags && util.isArray(req.body.tags) && req.body.tags.length > 0) {
                    var arr = [];
                    req.body.tags.forEach(function (item) {

                        var tagArr = item.split('.');
                        if (tagArr && tagArr.length > 0) {

                            tagArr.forEach(function (myTags) {
                                ticket.isolated_tags.push(myTags);
                            })
                        }

                    })

                }
                ////////////////////////////////////////////////////////////////////////////////////////////////////////
                ticket.save(function (err, client) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Ticket create failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (client) {
                            InsertUserRecentTicket(company, tenant, user._id, client.id, "comment");
                            if (req.body.requester)
                                AddExternalUserRecentTicket(company, tenant, req.body.requester, client.id);
                        }
                        ////////////////////////////////////////add note to engagement session async//////////////////////////
                        try {
                            EngagementSession.findOneAndUpdate({
                                engagement_id: req.body.engagement_session,
                                company: company,
                                tenant: tenant
                            }, {
                                $addToSet: {
                                    notes: {
                                        body: '#TID ' + ticket.reference,
                                        author: req.user.iss,
                                        created_at: Date.now(),
                                    }
                                }
                            }, function (err, notes) {
                                if (err) {
                                    logger.error("Append Note To EngagementSession Failed", err);
                                } else {
                                    logger.debug("Append Note To EngagementSession Success");
                                }
                            });
                        } catch (excep) {
                            logger.error("Append Note To EngagementSession Failed", excep);
                        }
                        //////////////////////////////////////////////////////////////////////////////////////////////////////
                        if (req.body.comments) {
                            var createTicketTasks = [];
                            req.body.comments.forEach(function (com) {

                                createTicketTasks.push(function (callBack) {
                                    var comment = Comment({
                                        body: com.body,
                                        body_type: com.body_type,
                                        type: com.type,
                                        public: com.public,
                                        author: author,
                                        author_external: com.author_external,
                                        attachments: com.attachments,
                                        channel: com.channel,
                                        channel_from: com.channel_from,
                                        engagement_session: ObjectId(req.body.engagement_session),
                                        created_at: new Date().toISOString(),
                                        meta_data: com.meta_data
                                    });

                                    comment.save(function (err, obj) {
                                        if (!err) {
                                            if (obj.id) {
                                                var time = new Date().toISOString();
                                                ticket.updated_at = time;
                                                ticket.comments.push(obj.id);
                                                var tEvent = TicketEvent({
                                                    type: 'status',
                                                    "author": req.user.iss,
                                                    "create_at": Date.now(),
                                                    body: {
                                                        "message": req.user.iss + " Make Comment " + obj.id,
                                                        "time": time
                                                    }
                                                });
                                                ticket.events.push(tEvent);
                                                /////////////////////////////////ticket matrix///////////////////////////////////////
                                                if (ticket.ticket_matrix) {
                                                    ticket.ticket_matrix.last_updated = time;
                                                    ticket.ticket_matrix.last_commented = time;

                                                    if (comment.author_external) {

                                                        if (ticket.ticket_matrix.external_replies)
                                                            ticket.ticket_matrix.external_replies += 1;
                                                        else
                                                            ticket.ticket_matrix.external_replies = 1;

                                                    } else {
                                                        if (ticket.ticket_matrix.replies)
                                                            ticket.ticket_matrix.replies += 1;
                                                        else
                                                            ticket.ticket_matrix.replies = 1;

                                                        if (ticket.collaborators && util.isArray(ticket.collaborators)) {

                                                            if (ticket.collaborators.indexOf(user._id) == -1) {
                                                                ticket.collaborators.push(user._id);
                                                            }
                                                        } else {
                                                            ticket.collaborators = [user._id];
                                                        }
                                                    }
                                                }
                                                //////////////////////////////////////////////////////////////////////////////

                                                ticket.save(function (err, rOrg) {
                                                    if (err) {
                                                        callBack(err, undefined);
                                                    } else {
                                                        callBack(undefined, rOrg);
                                                    }
                                                });
                                            }
                                            else {
                                                callBack(new Error("Invalid Data"), undefined);
                                            }
                                        }
                                    });

                                });

                            });

                            if (createTicketTasks.length > 0) {
                                async.parallel(createTicketTasks,
                                    function (err, results) {
                                        if (err) {
                                            jsonString = messageFormatter.FormatMessage(err, "Fail To Complete Process.", false, undefined);
                                            res.end(jsonString);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Process Complete.", true, results);
                                            res.end(jsonString);
                                        }
                                    });
                            }
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket create Sucess.", true, undefined);
                            res.end(jsonString);
                        }
                    }

                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};


/*to Facebook App*/

//-------------------Ticker Status Flow --------------------------------------------------------------

module.exports.CreateStatusNode = function (req, res) {
    logger.info("DVP-LiteTicket.CreateStatusNode Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                var ticketStatusNode = TicketStatusNode({
                    company: company,
                    tenant: tenant,
                    status_node: req.body.status_node,
                    name: req.body.status_node,
                    description: req.body.description,
                    node_type: 'custom',
                    category: req.body.category,
                    created_at: Date.now(),
                    updated_at: Date.now()
                });

                ticketStatusNode.save(function (err, tsn) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "TicketStatusNode create failed", false, undefined);
                    }
                    else {
                        jsonString = messageFormatter.FormatMessage(undefined, "TicketStatusNode saved successfully", true, tsn._doc);

                    }
                    res.end(jsonString);
                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.GetStatusNodes = function (req, res) {
    logger.info("DVP-LiteTicket.GetStatusNodes Internal method ");
    var jsonString;

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    TicketStatusNode.find({
        $and: [
            {$or: [{company: company}, {company: -1}]},
            {$or: [{tenant: tenant}, {tenant: -1}]}
        ]
    }, function (err, stn) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusNodes Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get StatusNodes Successful", true, stn);
        }
        res.end(jsonString);
    });
};

module.exports.UpdateStatusNode = function (req, res) {
    logger.info("DVP-LiteTicket.UpdateStatusNode Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusNode.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, sNode) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Find Status Node Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (sNode) {
                sNode.status_node = req.body.status_node;
                sNode.name = req.body.status_node;
                sNode.description = req.body.description;
                sNode.category = req.body.category;
                sNode.updated_at = Date.now();

                sNode.update(sNode, function (err, newSNode) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Status Node Types", false, undefined);
                    }
                    else {
                        if (newSNode) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Status Node Update Successfully", true, newSNode);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Status Node Update Failed", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Status Node Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.RemoveStatusNode = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveStatusNode Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusNode.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, sNode) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Status Node Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (sNode) {
                sNode.remove(function (err) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete Status Node Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Status Node successfully deleted", true, undefined);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete Status Node Failed, No Node object Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.CreateStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.CreateStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                if (req.body && req.body.type) {
                    TicketStatusFlow.findOne({
                        type: req.body.type,
                        company: company,
                        tenant: tenant
                    }, function (err, ticketFlow) {
                        if (err) {

                            jsonString = messageFormatter.FormatMessage(err, "Get ticketFlow Failed", false, undefined);
                            res.end(jsonString);

                        } else {
                            if (!ticketFlow) {
                                TicketTypes.findOne({company: company, tenant: tenant}, function (err, ticketTypes) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Check Ticket Types Availability", false, undefined);
                                        res.end(jsonString);
                                    } else {
                                        if (ticketTypes) {

                                            if (ticketTypes.default_types.indexOf(req.body.type) > -1 || ticketTypes.custom_types.indexOf(req.body.type) > -1) {

                                                var ticketStatusFlow = TicketStatusFlow({
                                                    created_at: Date.now(),
                                                    updated_at: Date.now(),
                                                    company: company,
                                                    tenant: tenant,
                                                    type: req.body.type,
                                                    flow_nodes: req.body.flow_nodes,
                                                    flow_connections: req.body.flow_connections
                                                });

                                                ticketStatusFlow.save(function (err, tsf) {
                                                    if (err) {
                                                        jsonString = messageFormatter.FormatMessage(err, "TicketStatusFlow failed to save", false, undefined);
                                                    }
                                                    else {
                                                        jsonString = messageFormatter.FormatMessage(undefined, "TicketStatusFlow saved successfully", true, tsf._doc);

                                                    }
                                                    res.end(jsonString);
                                                });
                                            } else {
                                                jsonString = messageFormatter.FormatMessage(err, "No Ticket Types Found", false, undefined);
                                                res.end(jsonString);
                                            }

                                        } else {
                                            jsonString = messageFormatter.FormatMessage(err, "No Ticket Types Found", false, undefined);
                                            res.end(jsonString);
                                        }
                                    }
                                });
                            } else {
                                ticketFlow.type = req.body.type;
                                ticketFlow.flow_nodes = req.body.flow_nodes;
                                ticketFlow.flow_connections = req.body.flow_connections;

                                ticketFlow.update(ticketFlow, function (err, newTSFlow) {
                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Fail to update Status Flow", false, undefined);
                                    }
                                    else {
                                        if (newTSFlow) {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Status Flow Update Successfully", true, newTSFlow);
                                        }
                                        else {
                                            jsonString = messageFormatter.FormatMessage(undefined, "Status Flow Update Failed", false, undefined);
                                        }
                                    }
                                    res.end(jsonString);
                                });
                            }
                        }

                    });
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Flow Type Required", false, undefined);
                    res.end(jsonString);
                }

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.GetStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.GetStatusFlow Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusFlow.find({company: company, tenant: tenant}).populate({
        path: 'flow_nodes.node',
        populate: {path: 'TicketStatusNode'}
    })
        .populate('flow_connections.source').populate('flow_connections.targets').exec(function (err, stf) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusFlow Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get StatusFlow Successful", true, stf);
        }
        res.end(jsonString);
    });
};

module.exports.GetStatusFlowByType = function (req, res) {
    logger.info("DVP-LiteTicket.GetStatusFlowByType Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusFlow.findOne({
        company: company,
        tenant: tenant,
        type: req.params.type
    }).populate({path: 'flow_nodes.node', populate: {path: 'TicketStatusNode'}})
        .populate('flow_connections.source').populate('flow_connections.targets').exec(function (err, stf) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusFlow Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get StatusFlow Successful", true, stf);
        }
        res.end(jsonString);
    });
};

module.exports.GetStatusFlowNodesByType = function (req, res) {
    logger.info("DVP-LiteTicket.GetStatusFlowNodesByType Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusFlow.findOne({
        company: company,
        tenant: tenant,
        type: req.params.type
    }).populate({path: 'flow_nodes.node', populate: {path: 'TicketStatusNode'}}).exec(function (err, stf) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusFlow Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get StatusFlow Successful", true, stf.flow_nodes);
        }
        res.end(jsonString);
    });
};

module.exports.GetStatusFlowNodesByConnections = function (req, res) {
    logger.info("DVP-LiteTicket.GetStatusFlowNodesByType Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusFlow.findOne({
        company: company,
        tenant: tenant,
        type: req.params.type
    }).populate('flow_connections.source').populate('flow_connections.targets').exec(function (err, stf) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusFlow Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get StatusFlow Successful", true, stf.flow_connections);
        }
        res.end(jsonString);
    });
};

module.exports.AddNodeToStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.AddNodeToStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                TicketStatusFlow.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
                    $addToSet: {
                        flow_nodes: {node: req.body.flow_node, position: req.body.position}
                    }
                }, function (err, tsf) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Add NodeToStatusFlow Failed", false, undefined);
                    } else {
                        if (tsf) {
                            tsf.flow_nodes.push(req.params.flownodeid);
                        }
                        jsonString = messageFormatter.FormatMessage(undefined, "Add NodeToStatusFlow Successful", true, tsf);
                    }
                    res.end(jsonString);
                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AddConnectionToStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.AddNodeToStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                TicketStatusFlow.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
                    $addToSet: {
                        flow_connections: req.body
                    }
                }, function (err, tsf) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Add NodeToStatusFlow Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Add NodeToStatusFlow Successful", true, tsf);
                    }
                    res.end(jsonString);
                });

            } else {

                jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.RemoveNodeFromStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveNodeFromStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusNode.findOne({_id: req.params.flownodeid}, function (err, fnode) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Node Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (fnode) {
                TicketStatusFlow.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
                    $pull: {
                        flow_nodes: {_id: req.params.flownodeid}
                    }
                }, function (err, tsf) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete NodeFromStatusFlow Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Delete NodeFromStatusFlow Successful", true, tsf);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Node Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.RemoveConnectionFromStatusFlow = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveNodeFromStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketStatusNode.findOne({_id: req.params.flownodeid}, function (err, fnode) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Node Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (fnode) {
                TicketStatusFlow.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
                    $pull: {
                        flow_nodes: {
                            _id: req.params.flowconnid
                        }
                    }
                }, function (err, tsf) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete NodeFromStatusFlow Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Delete NodeFromStatusFlow Successful", true, tsf);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Node Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.GetNextAvailableStatus = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveNodeFromStatusFlow Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    GetNextAvailableStatusList(tenant, company, req.params.ticketType, req.params.currentStatus, function (result) {
        res.end(result);
    });
};

module.exports.ValidateStatusChange = function (req, res) {
    logger.info("DVP-LiteTicket.ValidateStatusChange Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    ValidateStatusChangeRequest(tenant, company, req.params.ticketType, req.params.currentStatus, req.params.newStatus, function (result) {
        res.end(result);
    });
};

var GetNextAvailableStatusList = function (tenant, company, type, currentStatus, callback) {
    logger.info("DVP-LiteTicket.GetNextAvailableStatus Internal method ");
    var jsonString;
    var nextAvailableStatus = [];

    TicketStatusFlow.findOne({type: type, company: company, tenant: tenant}).populate('flow_connections.source')
        .populate('flow_connections.targets').exec(function (err, stf) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get StatusFlow Failed", false, nextAvailableStatus);
        } else {
            if (stf) {
                for (var i = 0; i < stf.flow_connections.length; i++) {
                    if (stf.flow_connections[i].source.status_node === currentStatus) {
                        if (nextAvailableStatus.indexOf(stf.flow_connections[i].targets.status_node) === -1) {
                            nextAvailableStatus.push(stf.flow_connections[i].targets.status_node);
                        }
                    }
                }
                jsonString = messageFormatter.FormatMessage(undefined, "Get NextAvailableStatus Successful", true, nextAvailableStatus);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "No Status Flow Found", false, nextAvailableStatus);
            }
        }
        callback(jsonString);
    });
};

var ValidateStatusChangeRequest = function (tenant, company, type, currentStatus, newStatus, callback) {
    logger.info("DVP-LiteTicket.ValidateStatusChangeRequest Internal method ");
    var jsonString;
    GetNextAvailableStatusList(tenant, company, type, currentStatus, function (result) {
        var jResult = JSON.parse(result);
        if (jResult && jResult.IsSuccess) {
            if (jResult.Result.indexOf(newStatus) > -1) {
                jsonString = messageFormatter.FormatMessage(undefined, "status valid", true, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "status Invalid", false, undefined);
            }
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "No Status Flow Found", false, undefined);
        }

        callback(jsonString);
    });
};

module.exports.GetNextAvailableStatusList = GetNextAvailableStatusList;

module.exports.ValidateStatusChangeRequest = ValidateStatusChangeRequest;

module.exports.GetTicketReport = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketsByView Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        if(req.query.businessunit)
        {
            tempQuery.businessUnit = req.query.businessunit;
        }

        tempQuery['created_at'] = {$gte: from, $lte: to};

        if (req.body) {

            if (req.body.tag) {
                tempQuery.isolated_tags = {$in: [req.body.tag]};
            }

            if (req.body.channel) {
                tempQuery.channel = req.body.channel;
            }

            if (req.body.priority) {
                tempQuery.priority = req.body.priority;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

        }

        var aggregator = [

            {
                $match: tempQuery,

            },
            {
                $group: {
                    _id: 0,
                    count: {
                        $sum: 1
                    },
                    reopen: {
                        $sum: {
                            $cond: ['$ticket_matrix.reopens', 1, 0]
                        }
                    },
                    sla_violated: {
                        $sum: {
                            $cond: ['$ticket_matrix.sla_violated', 1, 0]
                        }
                    },
                    first_call_resolved: {
                        $sum: {
                            $cond: ['$ticket_matrix.external_replies', 1, 0]
                        }
                    },
                    new: {
                        $sum: {
                            $cond: [{$eq: ["$status", "new"]}, 1, 0]
                        }
                    },
                    progressing: {
                        $sum: {
                            $cond: [{$or: [{$eq: ["$status", "open"]}, {$eq: ["$status", "progressing"]}]}, 1, 0]
                        }
                    }, closed: {
                        $sum: {
                            $cond: [{$eq: ["$status", "closed"]}, 1, 0]
                        }
                    }, resolved: {
                        $sum: {
                            $cond: [{$eq: ["$status", "solved"]}, 1, 0]
                        }
                    }, first_call_resolved: {
                        $sum: {
                            $cond: [{$eq: ['$ticket_matrix.external_replies', 0]}, 1, 0]
                        }
                    },
                    overdue_done: {
                        $sum: {
                            $cond: [{$and: [{$gt: ["$ticket_matrix.solved_at", "$due_at"]}, {$eq: ["$status", "closed"]}]}, 1, 0]
                        }
                    },
                    overdue_working: {
                        $sum: {
                            $cond: [{$and: [{$gt: [new Date(), "$due_at"]}, {$and: [{$ne: ["$status", "closed"]}, {$ne: ["$status", "solved"]}]}]}, 1, 0]
                        }
                    },
                    average_response: {
                        $avg: {

                            $cond: [{$ne: ["$status", "new"]}, "$ticket_matrix.waited_time", null]

                        }
                    },
                    average_resolution: {

                        $avg: {

                            $cond: [{$and: [{$eq: ["$status", "closed"]}, {$eq: ["$status", "solved"]}]}, "$ticket_matrix.resolution_time", null]

                        }
                    }
                }
            }, {
                $project: {
                    _id: 0,
                    statistics: {
                        total: '$count',
                        reopen: '$reopen',
                        sla_violated: '$sla_violated',
                        first_call_resolved: '$first_call_resolved',
                        average_response: '$average_response',
                        average_resolution: '$average_resolution',
                        overdue_done: '$overdue_done',
                        overdue_working: '$overdue_working',
                        new: '$new',
                        progressing: '$progressing',
                        closed: '$closed',
                        resolved: '$resolved'
                    }

                }
            }
        ];

        Ticket.aggregate(aggregator, function (err, tickets) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);
            }
            res.end(jsonString);
        });

    } else {

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }

}

module.exports.GetTicketReportTagBased = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketReportTagBased Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        if(req.query.businessunit)
        {
            tempQuery.businessUnit = req.query.businessunit;
        }

        tempQuery['created_at'] = {$gte: from, $lte: to};

        if (req.body && req.body.direction) {

            tempQuery['direction'] = req.body.direction;
        }


        var aggregator = [

            {
                $match: tempQuery,

            }, {
                $unwind: "$isolated_tags"
            }, {
                $group: {
                    _id: "$isolated_tags",
                    count: {
                        $sum: 1
                    }
                }
            }, {
                $project: {
                    _id: 0,
                    tag: '$_id',
                    count: 1

                }
            }, {
                $sort: {
                    count: -1
                }
            }
        ];

        Ticket.aggregate(aggregator, function (err, tickets) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);
            }
            res.end(jsonString);
        });

    } else {

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }

}

/*module.exports.GetTicketDetailReportDownload = function(req, res){


 logger.info("DVP-LiteTicket.GetTicketDetailReportDownload Internal method ");
 var company = parseInt(req.user.company);
 var tenant = parseInt(req.user.tenant);
 var jsonString;

 var ticketListForCSV = [];

 if(req.query && req.query['from']&& req.query['to']) {
 var from = req.query['from'];
 var to = req.query['to'];


 try {
 from = new Date(from);
 to = new Date(to);
 }catch(ex){
 jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
 res.end(jsonString);
 return;
 }

 if(from > to){

 jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
 res.end(jsonString);
 return;

 }

 var tempQuery = {company: company, tenant: tenant};

 tempQuery['created_at'] = { $gte: from, $lte: to };

 var fromDate = moment(from).format("YYYY-MM-DD");
 var toDate = moment(to).format("YYYY-MM-DD");

 var fileName = 'TICKET_' + fromDate + '_' + toDate;

 fileName = fileName.replace(/:/g, "-") + '.csv';

 var tagHeaders = ['Reference', 'Subject', 'Phone Number', 'Email', 'SSN', 'First Name', 'Last Name', 'Address', 'Customer Number', 'Created Date', 'Assignee', 'Submitter', 'Requester', 'Channel', 'Status', 'Priority', 'Type', 'SLA Violated', 'Description', 'Comments'];
 var tagOrder = ['reference', 'subject', 'phoneNumber', 'email', 'ssn', 'firstname', 'lastname', 'address', 'fromNumber', 'createdDate', 'assignee', 'submitter', 'requester', 'channel', 'status', 'priority', 'type', 'slaViolated', 'description', 'comments'];

 if(req.body){

 var tz = req.body.tz;

 var tagCount = req.body.tagCount;

 if(tagCount)
 {
 for (j = 0; j < tagCount; j++)
 {
 tagHeaders.push('Tag' + (j + 1));
 tagOrder.push('Tag' + (j + 1));
 }
 }

 if(req.body.tag)
 {
 tempQuery.isolated_tags = {$in: [req.body.tag]};
 }


 if(req.body.channel){
 tempQuery.channel =  req.body.channel;
 }

 if(req.body.priority){
 tempQuery.priority = req.body.priority;
 }

 if(req.body.type){
 tempQuery.type = req.body.type;
 }

 if(req.body.requester){
 tempQuery.requester = req.body.requester;
 }

 if(req.body.submitter){
 tempQuery.submitter = req.body.submitter;
 }

 if(req.body.assignee){
 tempQuery.assignee = req.body.assignee;
 }

 if(req.body.status){
 tempQuery.status = req.body.status;
 }

 if(req.body.type){
 tempQuery.type = req.body.type;
 }

 if(req.body.sla_violated){
 tempQuery.ticket_matrix.type = req.body.sla_violated;
 }
 }

 externalApi.RemoteGetFileMetadata(null, fileName, company, tenant, function(err, fileData)
 {
 if(err)
 {
 jsonString = messageFormatter.FormatMessage(err, "error getting file metadata", false, null);
 res.end(jsonString);
 }
 else
 {
 if(fileData)
 {
 //delete file
 externalApi.DeleteFile(null, fileData.UniqueId, company, tenant, function(err, delResp)
 {
 if(err)
 {
 jsonString = messageFormatter.FormatMessage(err, "error deleting file", false, null);
 res.end(jsonString);
 }
 else
 {
 externalApi.FileUploadReserve(null, fileName, company, tenant, function(err, fileResResp)
 {
 if(err || !fileResResp)
 {
 jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
 res.end(jsonString);
 }
 else
 {
 var uniqueId = fileResResp;

 jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
 res.end(jsonString);

 Ticket.find(tempQuery)
 .populate('assignee', 'name')
 .populate('assignee_group', 'name')
 .populate('requester', 'name firstname lastname ssn address phone email tags')
 .populate('engagement_session', 'channel_from')
 .populate('submitter', 'name')
 .populate('comments', 'body')
 .populate( {path: 'form_submission',populate : {path: 'form'}})
 .maxTime(300000)
 .lean()
 .exec(function (err, tickets)
 {
 if (err)
 {
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

 });
 }
 else
 {
 tickets.forEach(function (ticketInfo) {
 var ticketInfoTemp =
 {
 reference: ticketInfo.reference,
 subject: ticketInfo.subject,
 phoneNumber: (ticketInfo.requester ? ticketInfo.requester.phone : ''),
 email: (ticketInfo.requester ? ticketInfo.requester.email : ''),
 ssn: (ticketInfo.requester ? ticketInfo.requester.ssn : ''),
 firstname: (ticketInfo.requester ? ticketInfo.requester.firstname : ''),
 lastname: (ticketInfo.requester ? ticketInfo.requester.lastname : ''),
 address: '',
 fromNumber: (ticketInfo.engagement_session ? ticketInfo.engagement_session.channel_from : ''),
 createdDate: moment(ticketInfo.created_at).utcOffset(tz).format("YYYY-MM-DD HH:mm:ss"),
 assignee: (ticketInfo.assignee ? ticketInfo.assignee.name : ''),
 submitter: (ticketInfo.submitter ? ticketInfo.submitter.name : ''),
 requester: (ticketInfo.requester ? ticketInfo.requester.name : ''),
 channel: ticketInfo.channel,
 status: ticketInfo.status,
 priority: ticketInfo.priority,
 type: ticketInfo.type,
 slaViolated: (ticketInfo.ticket_matrix ? ticketInfo.ticket_matrix.sla_violated : false),
 description: ticketInfo.description

 };

 if(ticketInfo.engagement_session && ticketInfo.engagement_session.direction === 'outbound')
 {
 ticketInfoTemp.fromNumber = ticketInfo.engagement_session.channel_to;
 }

 if(ticketInfo.requester && ticketInfo.requester.address)
 {
 if(ticketInfo.requester.address.number)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.number + ', '
 }
 if(ticketInfo.requester.address.street)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.street + ', '
 }
 if(ticketInfo.requester.address.city)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.city + ', '
 }
 if(ticketInfo.requester.address.province)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.province + ', '
 }
 if(ticketInfo.requester.address.country)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.country + ', '
 }
 }

 var tempComments = '';

 if(ticketInfo.comments && ticketInfo.comments.length > 0)
 {
 ticketInfo.comments.forEach(function(comment){
 if(tempComments)
 {
 if(comment.body)
 {
 tempComments = tempComments + ',' + comment.body;
 }

 }
 else
 {
 if(comment.body)
 {
 tempComments = comment.body;
 }

 }

 })
 }

 ticketInfoTemp.comments = tempComments;


 for(i=0; i < tagCount; i++)
 {
 var tagName = 'Tag' + (i + 1);
 ticketInfoTemp[tagName] = '';

 if (ticketInfo.isolated_tags && ticketInfo.isolated_tags.length >= i)
 {
 ticketInfoTemp[tagName] = ticketInfo.isolated_tags[i];
 }
 }

 if(ticketInfo.form_submission && ticketInfo.form_submission.fields)
 {
 ticketInfo.form_submission.fields.forEach(function(field)
 {
 if(field.field)
 {
 var tempFieldName = 'DYNAMICFORM_' + field.field;
 if(tagHeaders.indexOf(tempFieldName) < 0)
 {
 tagHeaders.push(tempFieldName);
 tagOrder.push(tempFieldName);

 }

 ticketInfoTemp[tempFieldName] = field.value;

 }
 })
 }

 ticketListForCSV.push(ticketInfoTemp);

 });

 var csvFileData = json2csv({ data: ticketListForCSV, fields: tagOrder, fieldNames : tagHeaders });

 fs.writeFile(fileName, csvFileData, function(err)
 {
 if (err)
 {
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

 });

 logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - file service call failed', null, err);
 }
 else
 {
 externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function(err, uploadResp)
 {
 fs.unlink(fileName);
 if(!err && uploadResp)
 {
 console.log('File Upload success');

 }
 else
 {
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){
 if(err)
 {
 logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
 }
 });
 }

 });

 }
 });
 }

 });


 }

 });
 }
 })
 }
 else
 {
 externalApi.FileUploadReserve(null, fileName, company, tenant, function(err, fileResResp)
 {
 if(err || !fileResResp)
 {
 jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
 res.end(jsonString);
 }
 else
 {
 var uniqueId = fileResResp;

 jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
 res.end(jsonString);

 Ticket.find(tempQuery)
 .populate('assignee', 'name')
 .populate('assignee_group', 'name')
 .populate('requester', 'name firstname lastname ssn address phone email tags')
 .populate('engagement_session', 'channel_from')
 .populate('submitter', 'name')
 .populate('comments', 'body')
 .populate( {path: 'form_submission',populate : {path: 'form'}})
 .maxTime(300000)
 .lean()
 .exec(function (err, tickets)
 {
 if (err)
 {
 console.log(err);
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

 });
 }
 else
 {
 tickets.forEach(function (ticketInfo) {
 var ticketInfoTemp =
 {
 reference: ticketInfo.reference,
 subject: ticketInfo.subject,
 phoneNumber: (ticketInfo.requester ? ticketInfo.requester.phone : ''),
 email: (ticketInfo.requester ? ticketInfo.requester.email : ''),
 ssn: (ticketInfo.requester ? ticketInfo.requester.ssn : ''),
 firstname: (ticketInfo.requester ? ticketInfo.requester.firstname : ''),
 lastname: (ticketInfo.requester ? ticketInfo.requester.lastname : ''),
 address: '',
 fromNumber: (ticketInfo.engagement_session ? ticketInfo.engagement_session.channel_from : ''),
 createdDate: moment(ticketInfo.created_at).utcOffset(tz).format("YYYY-MM-DD HH:mm:ss"),
 assignee: (ticketInfo.assignee ? ticketInfo.assignee.name : ''),
 submitter: (ticketInfo.submitter ? ticketInfo.submitter.name : ''),
 requester: (ticketInfo.requester ? ticketInfo.requester.name : ''),
 channel: ticketInfo.channel,
 status: ticketInfo.status,
 priority: ticketInfo.priority,
 type: ticketInfo.type,
 slaViolated: (ticketInfo.ticket_matrix ? ticketInfo.ticket_matrix.sla_violated : false),
 description: ticketInfo.description

 };

 if(ticketInfo.engagement_session && ticketInfo.engagement_session.direction === 'outbound')
 {
 ticketInfoTemp.fromNumber = ticketInfo.engagement_session.channel_to;
 }

 if(ticketInfo.requester && ticketInfo.requester.address)
 {
 if(ticketInfo.requester.address.number)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.number + ', '
 }
 if(ticketInfo.requester.address.street)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.street + ', '
 }
 if(ticketInfo.requester.address.city)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.city + ', '
 }
 if(ticketInfo.requester.address.province)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.province + ', '
 }
 if(ticketInfo.requester.address.country)
 {
 ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.country + ', '
 }
 }

 var tempComments = '';

 if(ticketInfo.comments && ticketInfo.comments.length > 0)
 {
 ticketInfo.comments.forEach(function(comment){
 if(tempComments)
 {
 if(comment.body)
 {
 tempComments = tempComments + ',' + comment.body;
 }

 }
 else
 {
 if(comment.body)
 {
 tempComments = comment.body;
 }

 }

 })
 }

 ticketInfoTemp.comments = tempComments;

 for(i=0; i < tagCount; i++)
 {
 var tagName = 'Tag' + (i + 1);
 ticketInfoTemp[tagName] = '';

 if (ticketInfo.isolated_tags && ticketInfo.isolated_tags.length >= i)
 {
 ticketInfoTemp[tagName] = ticketInfo.isolated_tags[i];
 }
 }




 if(ticketInfo.form_submission && ticketInfo.form_submission.fields)
 {
 ticketInfo.form_submission.fields.forEach(function(field)
 {
 if(field.field)
 {
 var tempFieldName = 'DYNAMICFORM_' + field.field;
 if(tagHeaders.indexOf(tempFieldName) < 0)
 {
 tagHeaders.push(tempFieldName);
 tagOrder.push(tempFieldName);

 }

 ticketInfoTemp[tempFieldName] = field.value;

 }
 })
 }

 ticketListForCSV.push(ticketInfoTemp);

 });

 var csvFileData = json2csv({ data: ticketListForCSV, fields: tagOrder, fieldNames : tagHeaders });

 fs.writeFile(fileName, csvFileData, function(err)
 {
 if (err)
 {
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){

 });

 logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - file service call failed', null, err);
 }
 else
 {
 externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function(err, uploadResp)
 {
 fs.unlink(fileName);
 if(!err && uploadResp)
 {

 }
 else
 {
 externalApi.DeleteFile(null, uniqueId, company, tenant, function(err, delData){
 if(err)
 {
 logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
 }
 });
 }

 });

 }
 });
 }

 });


 }

 });
 }
 }

 });



 }
 else
 {

 jsonString = messageFormatter.FormatMessage(new Error('insufficient query parameters'), "insufficient query parameters", false, null);
 res.end(jsonString);
 }




 };*/


var appendToCSVFile = function (uniqueId, fileName, tempQuery, offset, limit, tz, tagCount, callback) {
    var newLine = "\r\n";
    var ticketListForCSV = [];

    var dynamicFormTagHeaders = [];


    var tagHeaders = ['Reference', 'Subject', 'Phone Number', 'Email', 'SSN', 'First Name', 'Last Name', 'Address', 'Customer Number', 'Created Date', 'Assignee', 'Submitter', 'Requester', 'Channel', 'Status', 'Priority', 'Type', 'Business Unit', 'SLA Violated', 'Description', 'Comments'];
    var tagOrder = ['reference', 'subject', 'phoneNumber', 'email', 'ssn', 'firstname', 'lastname', 'address', 'fromNumber', 'createdDate', 'assignee', 'submitter', 'requester', 'channel', 'status', 'priority', 'type', 'businessUnit', 'slaViolated', 'description', 'comments'];

    if(tagCount)
    {
        for (j = 0; j < tagCount; j++)
        {
            tagHeaders.push('Tag' + (j + 1));
            tagOrder.push('Tag' + (j + 1));
        }
    }

    Ticket.find(tempQuery)
        .skip(offset)
        .limit(limit)
        .populate('assignee', 'name')
        .populate('assignee_group', 'name')
        .populate('requester', 'name firstname lastname ssn address phone email tags')
        .populate('engagement_session', 'channel_from')
        .populate('submitter', 'name')
        .populate('comments', 'body')
        .populate({path: 'form_submission', populate: {path: 'form'}})
        .maxTime(300000)
        .lean()
        .exec(function (err, tickets) {
            if (err) {
                tickets = null;
                global.gc();
                callback(err, false);
            }
            else {
                if (tickets && tickets.length > 0) {
                    tickets.forEach(function (ticketInfo) {
                        var ticketInfoTemp =
                            {
                                reference: ticketInfo.reference,
                                subject: ticketInfo.subject,
                                phoneNumber: (ticketInfo.requester ? ticketInfo.requester.phone : ''),
                                email: (ticketInfo.requester ? ticketInfo.requester.email : ''),
                                ssn: (ticketInfo.requester ? ticketInfo.requester.ssn : ''),
                                firstname: (ticketInfo.requester ? ticketInfo.requester.firstname : ''),
                                lastname: (ticketInfo.requester ? ticketInfo.requester.lastname : ''),
                                address: '',
                                fromNumber: (ticketInfo.engagement_session ? ticketInfo.engagement_session.channel_from : ''),
                                createdDate: moment(ticketInfo.created_at).utcOffset(tz).format("YYYY-MM-DD HH:mm:ss"),
                                assignee: (ticketInfo.assignee ? ticketInfo.assignee.name : ''),
                                submitter: (ticketInfo.submitter ? ticketInfo.submitter.name : ''),
                                requester: (ticketInfo.requester ? ticketInfo.requester.name : ''),
                                channel: ticketInfo.channel,
                                status: ticketInfo.status,
                                priority: ticketInfo.priority,
                                type: ticketInfo.type,
                                businessUnit: ticketInfo.businessUnit,
                                slaViolated: (ticketInfo.ticket_matrix ? ticketInfo.ticket_matrix.sla_violated : false),
                                description: ticketInfo.description

                            };

                        if (ticketInfo.engagement_session && ticketInfo.engagement_session.direction === 'outbound') {
                            ticketInfoTemp.fromNumber = ticketInfo.engagement_session.channel_to;
                        }

                        if (ticketInfo.requester && ticketInfo.requester.address) {
                            if (ticketInfo.requester.address.number) {
                                ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.number + ', '
                            }
                            if (ticketInfo.requester.address.street) {
                                ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.street + ', '
                            }
                            if (ticketInfo.requester.address.city) {
                                ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.city + ', '
                            }
                            if (ticketInfo.requester.address.province) {
                                ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.province + ', '
                            }
                            if (ticketInfo.requester.address.country) {
                                ticketInfoTemp.address = ticketInfoTemp.address + ticketInfo.requester.address.country + ', '
                            }
                        }

                        var tempComments = '';

                        if (ticketInfo.comments && ticketInfo.comments.length > 0) {
                            ticketInfo.comments.forEach(function (comment) {
                                if (tempComments) {
                                    if (comment.body) {
                                        tempComments = tempComments + ',' + comment.body;
                                    }

                                }
                                else {
                                    if (comment.body) {
                                        tempComments = comment.body;
                                    }

                                }

                            })
                        }

                        ticketInfoTemp.comments = tempComments;


                        for (i = 0; i < tagCount; i++) {
                            var tagName = 'Tag' + (i + 1);
                            ticketInfoTemp[tagName] = '';

                            if (ticketInfo.isolated_tags && ticketInfo.isolated_tags.length >= i) {
                                ticketInfoTemp[tagName] = ticketInfo.isolated_tags[i];
                            }
                        }

                        if (ticketInfo.form_submission && ticketInfo.form_submission.fields) {
                            ticketInfo.form_submission.fields.forEach(function (field) {
                                if (field.field) {
                                    var tempFieldName = 'DYNAMICFORM_' + field.field;
                                    if (dynamicFormTagHeaders.indexOf(tempFieldName) < 0) {
                                        dynamicFormTagHeaders.push(tempFieldName);
                                        //tagOrder.push(tempFieldName);

                                    }

                                    ticketInfoTemp[tempFieldName] = field.value;

                                }
                            })
                        }

                        ticketListForCSV.push(ticketInfoTemp);

                    });

                    var newOrder = tagOrder.concat(dynamicFormTagHeaders.sort());

                    fs.stat(fileName, function (err) {
                        if (err == null) {
                            //write the actual data and end with newline
                            var csv = json2csv({
                                    data: ticketListForCSV,
                                    fields: newOrder,
                                    hasCSVColumnTitle: false
                                }) + newLine;

                            fs.appendFile(fileName, csv, function (err) {
                                if (err) {
                                    ticketListForCSV = null;
                                    tickets = null;
                                    global.gc();
                                    callback(err, false);

                                }
                                else {
                                    ticketListForCSV = null;
                                    tickets = null;
                                    global.gc();
                                    callback(null, true);
                                }

                            });
                        }
                        else {
                            var headerFields = newOrder + newLine;

                            fs.writeFile(fileName, headerFields, function (err, stat) {
                                if (err) {
                                    ticketListForCSV = null;
                                    tickets = null;
                                    global.gc();
                                    callback(err, false);
                                }
                                else {
                                    var csv = json2csv({
                                            data: ticketListForCSV,
                                            fields: newOrder,
                                            hasCSVColumnTitle: false
                                        }) + newLine;

                                    fs.appendFile(fileName, csv, function (err) {
                                        if (err) {
                                            ticketListForCSV = null;
                                            tickets = null;
                                            global.gc();
                                            callback(err, false);

                                        }
                                        else {
                                            ticketListForCSV = null;
                                            tickets = null;
                                            global.gc();
                                            callback(null, true);
                                        }

                                    });
                                }
                            });
                        }
                    });
                }
                else {
                    tickets = null;
                    global.gc();
                    callback(null, true);
                }


            }

        });

};

module.exports.GetTicketDetailReportDownload = function (req, res) {


    logger.info("DVP-LiteTicket.GetTicketDetailReportDownload Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];


        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tagHeaders = ['Reference', 'Subject', 'Phone Number', 'Email', 'SSN', 'First Name', 'Last Name', 'Address', 'Customer Number', 'Created Date', 'Assignee', 'Submitter', 'Requester', 'Channel', 'Status', 'Priority', 'Type', 'SLA Violated', 'Description', 'Comments'];
        var tagOrder = ['reference', 'subject', 'phoneNumber', 'email', 'ssn', 'firstname', 'lastname', 'address', 'fromNumber', 'createdDate', 'assignee', 'submitter', 'requester', 'channel', 'status', 'priority', 'type', 'slaViolated', 'description', 'comments'];

        var tempQuery = {company: company, tenant: tenant};

        if(req.query.businessunit)
        {
            tempQuery.businessUnit = req.query.businessunit;
        }

        tempQuery['created_at'] = {$gte: from, $lte: to};

        var fromDate = moment(from).format("YYYY-MM-DD");
        var toDate = moment(to).format("YYYY-MM-DD");

        var fileName = 'TICKET_' + fromDate + '_' + toDate;

        fileName = fileName.replace(/:/g, "-") + '.csv';

        var tz = '';
        var tagCount = 0;

        if (req.body) {

            tz = req.body.tz;

            tagCount = req.body.tagCount;

            if (tagCount) {
                for (j = 0; j < tagCount; j++) {
                    tagHeaders.push('Tag' + (j + 1));
                    tagOrder.push('Tag' + (j + 1));
                }
            }

            if (req.body.tag) {
                tempQuery.isolated_tags = {$in: [req.body.tag]};
            }

            if (req.body.channel) {
                tempQuery.channel = req.body.channel;
            }

            if (req.body.priority) {
                tempQuery.priority = req.body.priority;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.requester) {
                tempQuery.requester = req.body.requester;
            }

            if (req.body.submitter) {
                tempQuery.submitter = req.body.submitter;
            }

            if (req.body.assignee) {
                tempQuery.assignee = req.body.assignee;
            }

            if (req.body.status) {
                tempQuery.status = req.body.status;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.sla_violated) {
                tempQuery.ticket_matrix.type = req.body.sla_violated;
            }
        }

        var fileCheckKey = 'TICKETFILE:' + fromDate + ':' + toDate;

        redisClient.getset(fileCheckKey, true, function (err, redisResp) {
            if (redisResp) {
                jsonString = messageFormatter.FormatMessage(new Error('Another user generating same file, please try again'), "ERROR", false, null);
                logger.debug('[DVP-LiteTicket.GetTicketDetailReportDownload] - API RESPONSE : %s', jsonString);
                res.end(jsonString);
            }
            else {
                externalApi.RemoteGetFileMetadata(null, fileName, company, tenant, function (err, fileData) {
                    if (err) {
                        redisClient.del(fileCheckKey);
                        jsonString = messageFormatter.FormatMessage(err, "error getting file metadata", false, null);
                        res.end(jsonString);
                    }
                    else {
                        if (fileData) {
                            //delete file
                            externalApi.DeleteFile(null, fileData.UniqueId, company, tenant, function (err, delResp) {
                                if (err) {
                                    redisClient.del(fileCheckKey);
                                    jsonString = messageFormatter.FormatMessage(err, "error deleting file", false, null);
                                    res.end(jsonString);
                                }
                                else {
                                    externalApi.FileUploadReserve(null, fileName, company, tenant, function (err, fileResResp) {
                                        if (err || !fileResResp) {
                                            redisClient.del(fileCheckKey);
                                            jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
                                            res.end(jsonString);
                                        }
                                        else {
                                            var uniqueId = fileResResp;

                                            jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
                                            res.end(jsonString);

                                            var offset = 0;
                                            var limit = 5000;

                                            Ticket.count(tempQuery, function (err, ticketCnt) {
                                                if (!err && ticketCnt) {
                                                    var arr = [];
                                                    while (ticketCnt > offset) {
                                                        arr.push(appendToCSVFile.bind(this, uniqueId, fileName, tempQuery, offset, limit, tz, tagCount));
                                                        offset = offset + limit;

                                                    }

                                                    async.series(arr, function (err, results) {
                                                        if (err) {
                                                            redisClient.del(fileCheckKey);
                                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {

                                                            });
                                                        }
                                                        else {
                                                            externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function (err, uploadResp) {
                                                                redisClient.del(fileCheckKey);
                                                                fs.unlink(fileName);
                                                                if (!err && uploadResp) {

                                                                }
                                                                else {
                                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {
                                                                        if (err) {
                                                                            logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
                                                                        }
                                                                    });
                                                                }

                                                            });
                                                        }

                                                    })


                                                }
                                                else {
                                                    redisClient.del(fileCheckKey);
                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {

                                                    });

                                                }
                                            });


                                        }

                                    });
                                }
                            })
                        }
                        else {
                            externalApi.FileUploadReserve(null, fileName, company, tenant, function (err, fileResResp) {
                                if (err || !fileResResp) {
                                    redisClient.del(fileCheckKey);
                                    jsonString = messageFormatter.FormatMessage(err, "error reserving file", false, null);
                                    res.end(jsonString);
                                }
                                else {
                                    var uniqueId = fileResResp;

                                    jsonString = messageFormatter.FormatMessage(null, "SUCCESS", true, fileName);
                                    res.end(jsonString);

                                    var offset = 0;
                                    var limit = 5000;

                                    Ticket.count(tempQuery, function (err, ticketCnt) {
                                        if (!err && ticketCnt) {
                                            var arr = [];
                                            while (ticketCnt > offset) {
                                                arr.push(appendToCSVFile.bind(this, uniqueId, fileName, tempQuery, offset, limit, tz, tagCount));
                                                offset = offset + limit;

                                            }

                                            async.series(arr, function (err, results) {
                                                if (err) {
                                                    redisClient.del(fileCheckKey);
                                                    externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {

                                                    });
                                                }
                                                else {
                                                    externalApi.UploadFile(null, uniqueId, fileName, company, tenant, function (err, uploadResp) {
                                                        redisClient.del(fileCheckKey);
                                                        fs.unlink(fileName);
                                                        if (!err && uploadResp) {

                                                        }
                                                        else {
                                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {
                                                                if (err) {
                                                                    logger.error('[DVP-LiteTicket.GetTicketDetailReportDownload] - [%s] - Delete Failed : %s', null, err);
                                                                }
                                                            });
                                                        }

                                                    });
                                                }

                                            })


                                        }
                                        else {
                                            redisClient.del(fileCheckKey);
                                            externalApi.DeleteFile(null, uniqueId, company, tenant, function (err, delData) {

                                            });

                                        }
                                    });


                                }

                            });
                        }
                    }

                });
            }

        });


    }
    else {

        jsonString = messageFormatter.FormatMessage(new Error('insufficient query parameters'), "insufficient query parameters", false, null);
        res.end(jsonString);
    }


};

module.exports.GetTicketDetailReportAll = function (req, res) {


    logger.info("DVP-LiteTicket.GetTicketsByView Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        tempQuery['created_at'] = {$gte: from, $lte: to};

        if (req.body) {

            if (req.body.tag) {
                tempQuery.isolated_tags = {$in: [req.body.tag]};
            }

            if (req.body.channel) {
                tempQuery.channel = req.body.channel;
            }

            if (req.body.priority) {
                tempQuery.priority = req.body.priority;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.requester) {
                tempQuery.requester = req.body.requester;
            }

            if (req.body.submitter) {
                tempQuery.submitter = req.body.submitter;
            }

            if (req.body.assignee) {
                tempQuery.assignee = req.body.assignee;
            }

            if (req.body.status) {
                tempQuery.status = req.body.status;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.sla_violated) {
                tempQuery.ticket_matrix.type = req.body.sla_violated;
            }
        }

        Ticket.find(tempQuery)
            .populate('assignee', 'name avatar')
            .populate('assignee_group', 'name')
            .populate('requester', 'title gender name firstname lastname ssn address avatar phone email landnumber facebook twitter linkedin googleplus contacts tags')
            .populate('engagement_session')
            .populate('submitter', 'name avatar')
            .populate('collaborators', 'name avatar')
            .populate({path: 'form_submission', populate: {path: 'form'}})
            .exec(function (err, tickets) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);
                }
                res.end(jsonString);
            });

    } else {

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }


}

module.exports.GetTicketDetailReport = function (req, res) {


    logger.info("DVP-LiteTicket.GetTicketsByView Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        if(req.query.businessunit)
        {
            tempQuery.businessUnit = req.query.businessunit;
        }

        tempQuery['created_at'] = {$gte: from, $lte: to};

        if (req.body) {

            if (req.body.tag) {
                tempQuery.isolated_tags = {$in: [req.body.tag]};
            }

            if (req.body.channel) {
                tempQuery.channel = req.body.channel;
            }

            if (req.body.priority) {
                tempQuery.priority = req.body.priority;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.requester) {
                tempQuery.requester = req.body.requester;
            }

            if (req.body.submitter) {
                tempQuery.submitter = req.body.submitter;
            }

            if (req.body.assignee) {
                tempQuery.assignee = req.body.assignee;
            }

            if (req.body.status) {
                tempQuery.status = req.body.status;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.sla_violated) {
                tempQuery.ticket_matrix.type = req.body.sla_violated;
            }
        }

        if(req.query.channel && req.query.channel.toLowerCase()!="all")
        {
            tempQuery.channel=req.query.channel;
        }

        var tempLimit = parseInt(req.params.limit);
        var tempSkip = parseInt(req.params.skip);

        Ticket.find(tempQuery)
            .skip(tempSkip)
            .limit(tempLimit)
            .populate('assignee', 'name avatar')
            .populate('assignee_group', 'name')
            .populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus contacts')
            .populate('submitter', 'name avatar')
            .populate('collaborators', 'name avatar')
            .exec(function (err, tickets) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);
                }
                res.end(jsonString);
            });

    } else {

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }

}

module.exports.GetTicketDetailReportCount = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketsByView Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    if (req.query && req.query['from'] && req.query['to']) {
        var from = req.query['from'];
        var to = req.query['to'];

        try {
            from = new Date(from);
            to = new Date(to);
        } catch (ex) {
            jsonString = messageFormatter.FormatMessage(ex, "From and To dates are require", false, undefined);
            res.end(jsonString);
            return;
        }

        if (from > to) {

            jsonString = messageFormatter.FormatMessage(undefined, "From should less than To", false, undefined);
            res.end(jsonString);
            return;

        }

        var tempQuery = {company: company, tenant: tenant};

        if(req.query.businessunit)
        {
            tempQuery.businessUnit = req.query.businessunit;
        }

        tempQuery['created_at'] = {$gte: from, $lte: to};

        if (req.body) {

            if (req.body.tag) {
                tempQuery.isolated_tags = {$in: [req.body.tag]};
            }

            if (req.body.channel) {
                tempQuery.channel = req.body.channel;
            }

            if (req.body.priority) {
                tempQuery.priority = req.body.priority;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.requester) {
                tempQuery.requester = req.body.requester;
            }

            if (req.body.submitter) {
                tempQuery.submitter = req.body.submitter;
            }

            if (req.body.assignee) {
                tempQuery.assignee = req.body.assignee;
            }

            if (req.body.status) {
                tempQuery.status = req.body.status;
            }

            if (req.body.type) {
                tempQuery.type = req.body.type;
            }

            if (req.body.sla_violated) {
                tempQuery.ticket_matrix.type = req.body.sla_violated;
            }

        }

        Ticket.count(tempQuery, function (err, tickets) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
            } else {


                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);

            }
            res.end(jsonString);
        });

    } else {

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }


}

module.exports.GetTicketsByField = function (req, res) {


    logger.info("DVP-LiteTicket.GetTicketsByView Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var tempQuery = {company: company, tenant: tenant};


    if (req.params.key && req.params.value) {

        tempQuery[req.params.key] = req.params.value;
    }
    if(req.query.channel && req.query.channel.toLowerCase()!="all")
    {
        qObj.channel=req.query.channel;
    }

    Ticket.find(tempQuery, function (err, tickets) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, tickets);
        }
        res.end(jsonString);
    });


};

module.exports.GetExternalUserTicketCounts = function (req, res) {


    logger.debug("DVP-Interactions.GetEngagement Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var aggregator = [

        {
            $match: {requester: mongoose.Types.ObjectId(req.params.requester), company: company, tenant: tenant},
        },

        {
            "$group": {_id: "$status", count: {$sum: 1}}
        }
    ];

    Ticket.aggregate(aggregator, function (err, tickets) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket count Failed", false, undefined);
        } else {


            jsonString = messageFormatter.FormatMessage(undefined, "Get Ticket count Successful", true, tickets);

        }
        res.end(jsonString);
    });


};


//---------------------------------TicketTypes-------------------------------------------

module.exports.CreateTicketTypes = function (req, res) {
    logger.info("DVP-LiteTicket.CreateTicketTypes Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var customTypes = req.body.custom_types ? req.body.custom_types : [];

    var tTypes = TicketTypes({
        company: company,
        tenant: tenant,
        activate_default: true,
        default_types: ['Action', 'Complaint', 'Incident', 'Question' ],
        custom_types: customTypes,
        created_at: Date.now(),
        updated_at: Date.now()
    });

    var tStatusNodes = TicketStatusNode({
        company: company,
        tenant: tenant,
        activate_default: true,
        custom_nodes: [],
        created_at: Date.now(),
        updated_at: Date.now()
    });

    try {
        tTypes.save(function (err, ticketTypes) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Ticket types create failed", false, undefined);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Ticket types saved successfully", true, ticketTypes);
            }
            res.end(jsonString);
        });
    } catch (ex) {
        console.log(ex);
        jsonString = messageFormatter.FormatMessage(ex, "Ticket types create failed", false, undefined);
    }
};

module.exports.UpdateTicketTypes = function (req, res) {
    logger.info("DVP-LiteTicket.UpdateTicketTypes Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketTypes.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (ticketTypes) {
                ticketTypes.activate_default = req.body.activate_default;
                ticketTypes.custom_types = req.body.custom_types;
                ticketTypes.updated_at = Date.now();

                ticketTypes.update(ticketTypes, function (err, newTicketTypes) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket Types", false, undefined);
                    }
                    else {
                        if (newTicketTypes) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Types Update Successfully", true, newTicketTypes);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket Types Id.", false, newTicketTypes);
                        }
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Ticket Types Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.RemoveTicketTypes = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveTicketTypes Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketTypes.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (ticketTypes) {
                ticketTypes.remove(function (err) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete Ticket Types Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Ticket Types successfully deleted", true, undefined);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete Ticket Types Failed, Ticket Types object is null", false, undefined);
                res.end(jsonString);
            }
        }
    });
};

module.exports.AddCustomType = function (req, res) {
    logger.info("DVP-LiteTicket.AddCustomType Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketTypes.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $addToSet: {
            custom_types: req.params.customtype
        }
    }, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Add Custom Type Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Add Custom Type Successful", true, ticketTypes);
        }
        res.end(jsonString);
    });
};

module.exports.RemoveCustomType = function (req, res) {
    logger.info("DVP-LiteTicket.RemoveCutomType Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketTypes.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $pull: {
            custom_types: req.params.customtype
        }
    }, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Custom Type Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Custom Type Successful", true, ticketTypes);
        }
        res.end(jsonString);
    });
};

module.exports.GetTicketTypes = function (req, res) {
    logger.info("DVP-LiteTicket.GetTicketTypes Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    TicketTypes.findOne({company: company, tenant: tenant}, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Success", true, ticketTypes);
            res.end(jsonString);
        }
    });
};

module.exports.GetAvailableTypes = function (req, res) {
    logger.info("DVP-LiteTicket.GetAvailableTypes Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    GetAvailableTicketTypes(company, tenant, function (message, obj) {
        res.end(message);
    });
};


var GetAvailableTicketTypes = function (company, tenant, callback) {
    var jsonString;
    TicketTypes.findOne({company: company, tenant: tenant}, function (err, ticketTypes) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Failed", false, undefined);
            callback(jsonString, undefined);
        } else {
            var tTypes = [];
            if (ticketTypes) {
                if (ticketTypes.activate_default) {
                    tTypes = ticketTypes.default_types.concat(ticketTypes.custom_types);
                } else {
                    tTypes = ticketTypes.custom_types;
                }
            }
            jsonString = messageFormatter.FormatMessage(err, "Get Ticket Types Success", true, tTypes);
            callback(jsonString, ticketTypes);
        }
    });
};

module.exports.GetAvailableTicketTypes = GetAvailableTicketTypes;


// -------------------------------- Ticket Prefix ----------------------------------------
module.exports.AddNewTicketPrefix = function (req, res) {

    logger.info("DVP-LiteTicket.AddNewTicketPrefix Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var ticketPrefix = TicketPrefix({
        company: company,
        tenant: tenant,
        name: req.body.name,
        status: false
    });

    ticketPrefix.save(function (errPrefix, resPrefix) {
        if (errPrefix) {
            jsonString = messageFormatter.FormatMessage(errPrefix, "Ticket prefix saving failed ", false, undefined);
            res.end(jsonString);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "Ticket prefix saving succeeded ", true, resPrefix);
            res.end(jsonString);
        }
    });

};
module.exports.GetTicketPrefixAvailability = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketPrefixAvailability Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var tempQuery = {name: req.params.prefix};

    TicketPrefix.find(tempQuery, function (errPrefix, resPrefix) {
        if (errPrefix) {
            jsonString = messageFormatter.FormatMessage(errPrefix, "Check Prefix availability failed", false, undefined);
        } else {
            if (resPrefix.length > 0) {
                jsonString = messageFormatter.FormatMessage(undefined, "Check Prefix availability Successful", false, false);
            }
            else {
                jsonString = messageFormatter.FormatMessage(undefined, "Check Prefix availability Successful", true, true);
            }

        }
        res.end(jsonString);
    });


};
module.exports.GetAllTicketPrefixes = function (req, res) {

    logger.info("DVP-LiteTicket.GetAllTicketPrefixes Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var tempQuery = {company: company, tenant: tenant};

    TicketPrefix.find(tempQuery, function (errPrefix, resPrefix) {
        if (errPrefix) {
            jsonString = messageFormatter.FormatMessage(err, "Pick all prefixes failed", false, undefined);
        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Pick all prefixes Successful", true, resPrefix);


        }
        res.end(jsonString);
    });


};
module.exports.GetTicketPrefix = function (req, res) {

    logger.info("DVP-LiteTicket.GetTicketPrefix Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var tempQuery = {company: company, tenant: tenant, name: req.params.prefix};

    TicketPrefix.find(tempQuery, function (errPrefix, resPrefix) {
        if (errPrefix) {
            jsonString = messageFormatter.FormatMessage(err, "Pick prefix failed", false, undefined);
        } else {

            jsonString = messageFormatter.FormatMessage(undefined, "Pick prefix Successful", true, resPrefix);


        }
        res.end(jsonString);
    });


};
module.exports.MakePrefixAvailable = function (req, res) {

    logger.info("DVP-LiteTicket.MakePrefixAvailable Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    var disableQuery = {company: company, tenant: tenant, status: true};
    var enableQuery = {company: company, tenant: tenant, name: req.params.prefix};

    TicketPrefix.update(disableQuery,
        {
            status: false
        },
        {
            multi: true
        },
        function (errDisable, resDisable) {
            if (errDisable) {
                jsonString = messageFormatter.FormatMessage(errDisable, "Disable current prefix failed", false, undefined);
                res.end(jsonString);
            } else {


                TicketPrefix.findOneAndUpdate(enableQuery, {status: true}, function (errDefault, resDefault) {

                    if (errDefault) {
                        jsonString = messageFormatter.FormatMessage(errDefault, "Set available prefix failed", false, undefined);
                    }
                    else {

                        if (redisClient) {

                            var prefixKey = tenant + ":" + company + ":prefix:ticket";
                            redisClient.set(prefixKey, req.params.prefix, function (errSet, resSet) {

                                if (errSet) {
                                    jsonString = messageFormatter.FormatMessage(errSet, "Default prefix cache recording failed", false, errSet);
                                }
                                else {
                                    jsonString = messageFormatter.FormatMessage(undefined, "Default prefix cache recording successful", true, resDefault);
                                }
                                res.end(jsonString);
                            });


                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(new Error("Redis client not responding"), "Default prefix cache recording failed/ Redis client not responding", false, undefined);
                            res.end(jsonString);
                        }
                    }

                });


            }

        });


};


// -------------------------------- Tickets by Me ----------------------------------------
module.exports.GetAllTicketsSubmittedByMe = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllTicketsSubmittedByMe Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    submitter: user._id
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }

                var sortQuery = {};

                if (req.query.sorted_by) {

                    sortQuery[req.query.sorted_by] = -1;

                } else {
                    sortQuery = {created_at: -1}
                }

                if(req.query.channel && req.query.channel.toLowerCase()!="all")
                {
                    qObj.channel=req.query.channel;
                }

                Ticket.find(qObj
                ).populate('assignee', 'name avatar firstname lastname')
                    .populate('assignee', 'name avatar firstname lastname')
                    .populate('assignee_group', 'name')
                    .populate('requester', 'name avatar phone email landnumber facebook twitter linkedin googleplus firstname lastname')
                    .populate('submitter', 'name avatar firstname lastname').populate('collaborators', 'name avatar firstname lastname')
                    .skip(skip)
                    .limit(size).sort(sortQuery).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets submitted by me", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Tickets submitted by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Tickets submitted by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetAllTicketsWatchedByMe = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllTicketsWatchedByMe Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();
                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    watchers: {$in: [user._id]}
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }


                var sortQuery = {};

                if (req.query.sorted_by) {

                    sortQuery[req.query.sorted_by] = -1;

                } else {
                    sortQuery = {created_at: -1}
                }
                if(req.query.channel && req.query.channel.toLowerCase()!="all")
                {
                    qObj.channel=req.query.channel;
                }

                Ticket.find(qObj
                ).populate('assignee', 'name avatar firstname lastname')
                    .populate('assignee_group', 'name')
                    .populate('requester', 'name avatar firstname lastname phone email landnumber facebook twitter linkedin googleplus')
                    .populate('submitter', 'name avatar firstname lastname')
                    .populate('collaborators', 'name avatar firstname lastname')
                    .populate('watchers', 'name avatar firstname lastname')
                    .skip(skip)
                    .limit(size).sort(sortQuery).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets submitted by me", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Tickets submitted by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Tickets submitted by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetAllTicketsCollaboratedByMe = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllTicketsCollaboratedByMe Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {


            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    collaborators: {$in: [user._id]}
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }

                var sortQuery = {};

                if (req.query.sorted_by) {

                    sortQuery[req.query.sorted_by] = -1;

                } else {
                    sortQuery = {created_at: -1}
                }

                if(req.query.channel && req.query.channel.toLowerCase()!="all")
                {
                    qObj.channel=req.query.channel;
                }

                Ticket.find(qObj
                ).populate('assignee', 'name avatar firstname lastname')
                    .populate('assignee_group', 'name')
                    .populate('requester', 'name avatar firstname lastname phone email landnumber facebook twitter linkedin googleplus')
                    .populate('submitter', 'name avatar firstname lastname')
                    .populate('collaborators', 'name avatar firstname lastname')
                    .populate('watchers', 'name avatar firstname lastname').skip(skip)
                    .limit(size).sort(sortQuery).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets Collaborated by me", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Tickets Collaborated by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Tickets Collaborated by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetMySubmittedTicketCount = function (req, res) {
    logger.debug("DVP-LiteTicket.GetMySubmittionCount Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {


            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();

                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    submitter: user._id
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }

                Ticket.count(qObj).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to get count of Tickets submitted by me ", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {

                            jsonString = messageFormatter.FormatMessage(undefined, "Count of tickets submitted by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail to get count of Tickets submitted by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetMyWatchedTicketCount = function (req, res) {
    logger.debug("DVP-LiteTicket.GetMyWatchedCount Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    watchers: {$in: [user._id]}
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }

                Ticket.count(qObj).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to get count of Tickets watched by me ", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {

                            jsonString = messageFormatter.FormatMessage(undefined, "Count of tickets watched by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail to get count of Tickets watched by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetMyCollaboratedTicketCount = function (req, res) {
    logger.debug("DVP-LiteTicket.GetMyCollaboratedCount Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    collaborators: {$in: [user._id]}
                };
                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }

                Ticket.count(qObj).exec(function (err, tickets) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to get count of Tickets Collaborated by me ", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (tickets) {

                            jsonString = messageFormatter.FormatMessage(undefined, "Count of tickets Collaborated by me found", true, tickets);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail to get count of Tickets Collaborated by me", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};


// -------------------------------- Tickets Count ----------------------------------------
module.exports.GetAllTicketsCount = function (req, res) {

    logger.info("DVP-LiteTicket.GetAllTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    var qObj = {company: company, tenant: tenant, active: true};

    if(req.query.businessunit)
    {
        qObj.businessUnit = req.query.businessunit;
    }

    if (req.query.status) {
        var paramArr;
        if (Array.isArray(req.query.status)) {
            paramArr = req.query.status;
        } else {

            paramArr = [req.query.status];
        }
        qObj.status = {$in: paramArr};
    }

    Ticket.count(qObj).exec(function (err, resCount) {
        if (err) {

            jsonString = messageFormatter.FormatMessage(err, "Get All Tickets Failed", false, undefined);

        } else {

            if (resCount) {

                jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets Successful", true, resCount);

            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, 0);

            }
        }

        res.end(jsonString);
    });

};
module.exports.GetMyTicketsCount = function (req, res) {
    logger.debug("DVP-LiteTicket.GetAllMyTickets Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;
    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                var qObj = {
                    company: company,
                    tenant: tenant, active: true,
                    assignee: user._id
                };


                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    qObj.status = {$in: paramArr}
                }
                Ticket.count(qObj).exec(function (err, resCount) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Fail to Find Tickets", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (resCount) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Find Tickets", true, resCount);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Fail To Find Ticket", false, undefined);
                        }
                        res.end(jsonString);
                    }
                });


            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Get User Failed", false, undefined);
                res.end(jsonString);
            }
        }
    });
};
module.exports.GetMyGroupTicketsCount = function (req, res) {
    logger.info("DVP-LiteTicket.GetAllGroupTickets Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);

    var page = parseInt(req.params.Page),
        size = parseInt(req.params.Size),
        skip = page > 0 ? ((page - 1) * size) : 0;

    var jsonString;


    UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').populate({path: 'group'}).exec( function (err, useraccount) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);

        } else {

            if (useraccount && useraccount.userref && useraccount.group) {

                //    var user = useraccount.userref.toObject();
                // if (user && user.group) {
                /*
                 UserGroup.find({"users": user._id}, function (error, groups) {
                 if(!error  && groups) {
                 var ids = [];
                 groups.forEach(function (item) {
                 console.log(item.id);
                 ids.push(item._id);
                 });
                 var obj = {
                 company: company,
                 tenant: tenant,
                 assignee_group: {$in: ids},
                 active: true,
                 };
                 var paramArr;
                 if (req.query.status) {
                 if (Array.isArray(req.query.status)) {
                 paramArr = req.query.status;
                 } else {
                 paramArr = [req.query.status];
                 }
                 obj[status] = {$in: paramArr}
                 }
                 */


                var obj = {

                    "company": company,
                    "tenant": tenant,
                    "assignee_group": useraccount.group,
                    "active": true
                }

                if (req.query.status) {
                    var paramArr;
                    if (Array.isArray(req.query.status)) {
                        paramArr = req.query.status;
                    } else {

                        paramArr = [req.query.status];
                    }

                    obj.status = {$in: paramArr}
                }

                Ticket.count(obj).exec(function (err, resCount) {
                    if (err) {

                        jsonString = messageFormatter.FormatMessage(err, "Get All Tickets and Status Failed", false, undefined);

                    } else {

                        if (resCount) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Get All Tickets By Group ID and Status Successful", true, resCount);
                        } else {

                            jsonString = messageFormatter.FormatMessage(undefined, "No Tickets Found", false, undefined);
                        }
                    }
                    res.end(jsonString);
                });


            } else {

                jsonString = messageFormatter.FormatMessage(undefined, "No User Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
};


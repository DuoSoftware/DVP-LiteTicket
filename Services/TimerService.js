var mongoose = require('mongoose');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var TimeEntry = require('dvp-mongomodels/model/TimeEntry').TimeEntry;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var TicketEvent = require('dvp-mongomodels/model/Ticket').TicketEvent;
var User = require('dvp-mongomodels/model/User');
var UserAccount = require('dvp-mongomodels/model/UserAccount');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var moment = require('moment');
var unique = require("array-unique");
var util = require('util');

function CreateTimer(req, res){

    logger.debug("DVP-LiteTicket.CreateTimer Internal method ");
    var jsonString;
    var tenant = parseInt(req.user.tenant);
    var company = parseInt(req.user.company);



    Ticket.findOne({_id: req.body.ticket, company: company, tenant: tenant}, function (err, ticket) {
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


                            TimeEntry.findOne({
                                user: user.id,
                                running: true,
                                company: company,
                                //time_events: [{state:'start', time: Date.now()}],
                                //last_event:'start',
                                tenant: tenant
                            }, function (err, forms) {
                                if ((err || !forms)&& req.body) {

                                        var timeentry = TimeEntry({
                                            user: user._id,
                                            ticket: req.body.ticket,
                                            startTime: Date.now(),
                                            running: true,
                                            time: 0,
                                            last_event_date: Date.now(),
                                            company: parseInt(req.user.company),
                                            tenant: parseInt(req.user.tenant)
                                        });
                                        timeentry.save(function (err, form) {
                                            if (err) {
                                                jsonString = messageFormatter.FormatMessage(err, "Time entry saved failed", false, undefined);
                                                res.end(jsonString);
                                            } else {
                                                jsonString = messageFormatter.FormatMessage(undefined, "Time entry saved successfully", true, timeentry);
                                                //res.end(jsonString);


                                                /////////////////////////////////////////////////////////////////////////////////
                                                var tEvent = TicketEvent({
                                                    "author": req.user.iss,
                                                    "create_at": Date.now(),
                                                    type: 'tracker',
                                                    body: {
                                                        "message": req.user.iss + " created time entry",
                                                        "time": new Date()
                                                    }
                                                });
                                                ticket.events.push(tEvent);

                                                ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                                                if(ticket.ticket_matrix) {

                                                    ticket.ticket_matrix.last_updated = new Date();

                                                    if(!ticket.ticket_matrix.worked_time)
                                                        ticket.ticket_matrix.worked_time =0;
                                                }


                                                if(ticket.collaborators && util.isArray(ticket.collaborators)){

                                                    if(ticket.collaborators.indexOf(user._id) == -1) {
                                                        ticket.collaborators.push(user._id);
                                                    }
                                                }else{
                                                    ticket.collaborators = [user._id];
                                                }




                                                ticket.save(function (err, ticket_save) {
                                                    if (err) {
                                                        jsonString = messageFormatter.FormatMessage(err, "Fail Save Ticket", false, undefined);
                                                    }
                                                    else {
                                                        if (ticket_save) {
                                                            jsonString = messageFormatter.FormatMessage(undefined, "Ticket Saved Successfully", true, timeentry);

                                                        }
                                                        else {
                                                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, undefined);
                                                        }
                                                    }
                                                    res.end(jsonString);
                                                });
                                                ///////////////////////////////////////////////////////////////////////////////////////////////////////

                                            }
                                        });
                                } else {

                                    jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successful", true, forms);
                                    res.end(jsonString);
                                }

                            });

                            }else{

                                jsonString = messageFormatter.FormatMessage(undefined, "User Not found", false, undefined);
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
function GetTimes(req, res){


    logger.debug("DVP-LiteTicket.GetTimes Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    TimeEntry.find({company: company, tenant: tenant}, function(err, forms) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Time entries Failed", false, undefined);
        }else {
            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Time entries Successful", true, forms);
            }else{
                jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
            }
        }
        res.end(jsonString);
    });
};
function GetTimesForUser(req, res){


    logger.debug("DVP-LiteTicket.GetTimesForUser Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    if(req.query && req.query['from']&& req.query['to']) {
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

        tempQuery['startTime'] = {$gte: from, $lte: to};

        tempQuery.user= req.params.uid;
        tempQuery.company= company;
        tempQuery.tenant= tenant;

        TimeEntry.find(tempQuery).populate('user' , '-password').populate('ticket').exec(function (err, forms) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Get Time entries Failed", false, undefined);
            } else {
                if (forms) {
                    jsonString = messageFormatter.FormatMessage(err, "Get Time entries Successful", true, forms);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
                }
            }
            res.end(jsonString);
        });

    }else{

        jsonString = messageFormatter.FormatMessage(undefined, "From and To dates are require", false, undefined);
        res.end(jsonString);
    }
};
function GetTimesForTicket(req, res){


    logger.debug("DVP-LiteTicket.GetTimesForTicket Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    TimeEntry.find({ticket: req.params.tid, company: company, tenant: tenant}, function(err, forms) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Time entries Failed", false, undefined);
        }else {
            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Time entries Successful", true, forms);
            }else{
                jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
            }
        }
        res.end(jsonString);
    });
};
function GetTimesForTicketByUser(req, res){


    logger.debug("DVP-LiteTicket.GetTimesForTicket Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    TimeEntry.find({user: req.params.uid,ticket: req.params.tid, company: company, tenant: tenant}, function(err, forms) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Time entries Failed", false, undefined);
        }else {
            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Time entries Successful", true, forms);
            }else{
                jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
            }
        }
        res.end(jsonString);
    });
};
function GetTime(req, res){


    logger.debug("DVP-LiteTicket.GetTimes Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;
    TimeEntry.findOne({id:req.params.is,company: company, tenant: tenant}, function(err, forms) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Time entries Failed", false, undefined);
        }else {
            if (forms) {
                jsonString = messageFormatter.FormatMessage(err, "Get Time entries Successful", true, forms);
            }else{
                jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
            }
        }
        res.end(jsonString);
    });
};
function GetMyTimes(req, res){


    logger.debug("DVP-LiteTicket.GetMyTimeSheet Internal method ");
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


                TimeEntry.find({user: user.id, company: company, tenant: tenant}, function(err, forms) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get my Time entries Failed", false, undefined);
                    }else {
                        if (forms) {
                            jsonString = messageFormatter.FormatMessage(err, "Get my Time entries Successful", true, forms);
                        }else{
                            jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
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

};
function DeleteMyTimer(req, res) {


    logger.debug("DVP-LiteTicket.DeleteMyTimes Internal method ");
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


                TimeEntry.findOneAndRemove({
                    user: user.id,
                    running: true,
                    company: company,
                    tenant: tenant
                }, function (err, forms) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get my Time entries Failed", false, undefined);
                    } else {
                        if (forms) {
                            jsonString = messageFormatter.FormatMessage(err, "Get my Time entries Successful", true, forms);
                        } else {
                            jsonString = messageFormatter.FormatMessage(undefined, "No Time entries Found", false, undefined);
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
};
function GetMyTimer(req, res) {


    logger.debug("DVP-LiteTicket.GetMyTimer Internal method ");
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


                TimeEntry.findOne({
                    user: user.id,
                    running: true,
                    company: company,
                    tenant: tenant
                }, function (err, forms) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                    } else {
                        if (forms) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successful", true, forms);
                        } else {
                            jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
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
};
function UpdateMyTimerTicket(req, res){


    logger.debug("DVP-LiteTicket.UpdateMyTimerTicket Internal method ");
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

                 UserAccount.findOne({user: req.user.iss, company: company, tenant: tenant}).populate('userref', '-password').exec( function (err, useraccount) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                         if (useraccount && useraccount.userref) {

                var user = useraccount.userref.toObject();


                            TimeEntry.findOneAndUpdate({_id: req.params.id, user: user.id, running: true, company: company, tenant: tenant}, {ticket: req.params.tid},function(err, forms) {
                                if (err) {
                                    jsonString = messageFormatter.FormatMessage(err, "Update Time entry Failed", false, undefined);
                                }else {
                                    if (forms) {
                                        jsonString = messageFormatter.FormatMessage(err, "Update Time entry Successful", true, forms);
                                    }else{
                                        jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
                                    }
                                }
                                res.end(jsonString);
                            });


                        }else{

                            jsonString = messageFormatter.FormatMessage(undefined, "User Not found", false, undefined);
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
function UpdateMyTimerTime(req, res){

    logger.debug("DVP-LiteTicket.UpdateMyTimerTime Internal method ");
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


                TimeEntry.findOneAndUpdate({_id: req.params.id, running: true, company: company, tenant: tenant}, {time: req.params.time},function(err, forms) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Update Time entry Failed", false, undefined);
                    }else {
                        if (forms) {
                            jsonString = messageFormatter.FormatMessage(err, "Update Time entry Successful", true, forms);
                        }else{
                            jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
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

};
function StartTimer(req, res){

    logger.debug("DVP-LiteTicket.StartTimer Internal method ");
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


                TimeEntry.findOne({user: user.id, running: true, last_event:'pause', company: company, tenant: tenant}, function(err, timer) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                        res.end(jsonString);
                    }else {
                        if (timer) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successfull", true, timer);
                            var timeevent = {state:'start', time: Date.now()};
                            if(req.body && req.body.note){

                                timeevent["note"] = req.body.note;
                            }

                            TimeEntry.findOneAndUpdate(
                                {user: user.id,  running: true, last_event:'pause', company: company, tenant: tenant},
                                {
                                    last_event_date: Date.now(),
                                    last_event:'start',
                                    running: true,
                                    $addToSet:{time_events:timeevent},

                                },function(err, timer) {

                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Add Time entry Failed", false, timer);
                                    }else {
                                        jsonString = messageFormatter.FormatMessage(err, "AddTime entry successfull", true, timer);
                                    }
                                    res.end(jsonString);

                                });
                        }else{
                            jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
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


};
function PauseTimer(req, res){

    logger.debug("DVP-LiteTicket.PauseTimer Internal method ");
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


                TimeEntry.findOne({user: user.id, _id: req.params.id, company: company, tenant: tenant}, function(err, timer) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                        res.end(jsonString);
                    }else {
                        if (timer) {


                            if (timer.running && timer.last_event == 'start') {

                                jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successfull", true, timer);
                                var timeevent = {state: 'pause', time: Date.now()};

                                if (req.body && req.body.note) {

                                    timeevent["note"] = req.body.note;
                                }

                                var ms = moment(Date.now()).diff(moment(timer.last_event_date));
                                var d = moment.duration(ms);
                                var time = timer.time + d;
                                TimeEntry.findOneAndUpdate(
                                    {
                                        user: user.id,
                                        running: true,
                                        last_event: 'start',
                                        company: company,
                                        tenant: tenant
                                    },
                                    {
                                        last_event_date: Date.now(),
                                        time: time,
                                        last_event: 'pause',
                                        $addToSet: {time_events: timeevent},

                                    }, function (err, timer) {

                                        if (err) {
                                            jsonString = messageFormatter.FormatMessage(err, "Add Time entry Failed", false, timer);
                                        } else {
                                            jsonString = messageFormatter.FormatMessage(err, "AddTime entry successfull", true, timer);
                                        }
                                        res.end(jsonString);

                                    });
                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
                                res.end(jsonString);
                            }
                        }else{

                            jsonString = messageFormatter.FormatMessage(err, "AddTime entry successfull", true, timer);
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


};
function StopTimer(req, res){

    logger.debug("DVP-LiteTicket.StopTimer Internal method ");
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


                TimeEntry.findOne({user: user._id, _id:req.params.id, company: company, tenant: tenant}, function(err, timer) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                        res.end(jsonString);
                    }else {
                        if (timer) {
                            if (timer.running) {
                                jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successful", true, timer);
                                var timeevent = {state: 'stop', time: Date.now()};

                                if (req.body && req.body.note) {

                                    timeevent["note"] = req.body.note;
                                }

                                var time = timer.time;
                                if (timer.last_event == 'start') {
                                    var ms = moment(Date.now()).diff(moment(timer.last_event_date));
                                    var d = moment.duration(ms);
                                    time = timer.time + ms;
                                }

                                TimeEntry.findOneAndUpdate(
                                    {user: user._id, running: true, company: company, tenant: tenant},
                                    {
                                        last_event_date: Date.now(),
                                        time: time,
                                        last_event: 'stop',
                                        running: false,
                                        $addToSet: {time_events: timeevent}

                                    }, function (err, timer) {

                                        if (err) {
                                            jsonString = messageFormatter.FormatMessage(err, "Add Time entry Failed", false, timer);
                                            res.end(jsonString);
                                        } else {

                                            if (timer) {
                                                jsonString = messageFormatter.FormatMessage(err, "AddTime entry successfully", true, timer);

                                                Ticket.findOne({
                                                    company: company,
                                                    tenant: tenant,
                                                    _id: timer.ticket
                                                }, function (err, ticket) {
                                                    if (err) {

                                                        jsonString = messageFormatter.FormatMessage(err, "Fail Find Ticket", false, undefined);
                                                        res.end(jsonString);
                                                    }
                                                    else {
                                                        if (ticket) {

                                                            var tEvent = TicketEvent({
                                                                type: 'tracker',
                                                                "author": req.user.iss,
                                                                "create_at": Date.now(),
                                                                body: {
                                                                    "message": req.user.iss + " added time " + time,
                                                                    "time": new Date()
                                                                }
                                                            });
                                                            ticket.events.push(tEvent);


                                                            ////////////////////////////////////////////////ticket matrix/////////////////////////////////////////

                                                            if (ticket.ticket_matrix) {
                                                                ticket.ticket_matrix.last_updated = new Date();
                                                                ticket.ticket_matrix.worked_time = time;
                                                            }

                                                            ///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                            ticket.save(function (err, rUser) {
                                                                if (err) {
                                                                    jsonString = messageFormatter.FormatMessage(err, "Fail Update Ticket", false, undefined);
                                                                }
                                                                else {
                                                                    if (rUser) {
                                                                        jsonString = messageFormatter.FormatMessage(undefined, "Ticket Update Successfully", true, timer);
                                                                    }
                                                                    else {
                                                                        jsonString = messageFormatter.FormatMessage(undefined, "Invalid Ticket ID.", false, timer);
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

                                            } else {
                                                jsonString = messageFormatter.FormatMessage(undefined, "Add Time entry Failed", false, timer);
                                                res.end(jsonString);
                                            }
                                            ////////////////////////////update ticket////////////////////////////////////////////////////
                                        }


                                    });
                            } else {
                                jsonString = messageFormatter.FormatMessage(undefined, "No Time entry Found", false, undefined);
                                res.end(jsonString);
                            }
                        }else{

                            jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successful", true, timer);
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

};


module.exports.DeleteMyTimer = DeleteMyTimer;
module.exports.StartTimer = StartTimer;
module.exports.CreateTimer =CreateTimer;
module.exports.GetTimes = GetTimes;
module.exports.GetTimesForUser = GetTimesForUser;
module.exports.GetTimesForTicket = GetTimesForTicket;
module.exports.GetTimesForTicketByUser = GetTimesForTicketByUser;
module.exports.GetTime = GetTime;
module.exports.GetMyTimer = GetMyTimer;
module.exports.GetMyTimes = GetMyTimes;
module.exports.UpdateMyTimerTicket = UpdateMyTimerTicket;
module.exports.UpdateMyTimerTime = UpdateMyTimerTime;
module.exports.PauseTimer = PauseTimer;
module.exports.StopTimer = StopTimer;
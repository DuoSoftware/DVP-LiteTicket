var mongoose = require('mongoose');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var TimeEntry = require('dvp-mongomodels/model/TimeEntry').TimeEntry;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var User = require('dvp-mongomodels/model/User');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var moment = require('moment');

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

                User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (user) {

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
                                            user: user.id,
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
                                                jsonString = messageFormatter.FormatMessage(undefined, "Time entry saved successfully", true, form);
                                                res.end(jsonString);
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
    TimeEntry.find({user: req.params.uid, company: company, tenant: tenant}, function(err, forms) {
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



    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

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


    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

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

    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

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

                User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
                        res.end(jsonString);
                    }
                    else {
                        if (user) {

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


    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

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


    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

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


    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

                TimeEntry.findOne({user: user.id, running: true,last_event:'start', company: company, tenant: tenant}, function(err, timer) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                        res.end(jsonString);
                    }else {
                        if (timer) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successfull", true, timer);
                            var timeevent = {state:'pause', time: Date.now()};

                            if(req.body && req.body.note){

                                timeevent["note"] = req.body.note;
                            }

                            var ms = moment(Date.now()).diff(moment(timer.last_event_date));
                            var d = moment.duration(ms);
                            var time = timer.time + d;
                            TimeEntry.findOneAndUpdate(
                                {user: user.id, running: true,last_event:'start', company: company, tenant: tenant},
                                {
                                    last_event_date: Date.now(),
                                    time: time,
                                    last_event:'pause',
                                    $addToSet:{time_events:timeevent},

                                },function(err, timer) {

                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Add Time entry Failed", false, timer);
                                    }else {
                                        jsonString = messageFormatter.FormatMessage(err, "AddTime entry sucessfull", true, timer);
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
function StopTimer(req, res){

    logger.debug("DVP-LiteTicket.StopTimer Internal method ");
    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    User.findOne({username: req.user.iss, company: company, tenant: tenant}, function (err, user) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get User Failed", false, undefined);
            res.end(jsonString);
        }
        else {
            if (user) {

                TimeEntry.findOne({user: user.id, running: true, company: company, tenant: tenant}, function(err, timer) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Get Time entry Failed", false, undefined);
                        res.end(jsonString);
                    }else {
                        if (timer) {
                            jsonString = messageFormatter.FormatMessage(err, "Get Time entry Successful", true, timer);
                            var timeevent = {state:'stop', time: Date.now()};

                              if(req.body && req.body.note){

                                  timeevent["note"] = req.body.note;
                              }

                            var time = timer.time;
                            if(timer.last_event == 'start') {
                                var ms = moment(Date.now()).diff(moment(timer.last_event_date));
                                var d = moment.duration(ms);
                                time = timer.time + d;
                            }

                            TimeEntry.findOneAndUpdate(
                                {user: user.id, running: true, company: company, tenant: tenant},
                                {
                                    last_event_date: Date.now(),
                                    time: time,
                                    last_event:'stop',
                                    running: false,
                                    $addToSet:{time_events:timeevent}

                                },function(err, timer) {

                                    if (err) {
                                        jsonString = messageFormatter.FormatMessage(err, "Add Time entry Failed", false, timer);
                                    }else {
                                        jsonString = messageFormatter.FormatMessage(err, "AddTime entry sucessful", true, timer);
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


module.exports.DeleteMyTimer = DeleteMyTimer;
module.exports.StartTimer = StartTimer;
module.exports.CreateTimer =CreateTimer;
module.exports.GetTimes = GetTimes;
module.exports.GetTimesForUser = GetTimesForUser;
module.exports.GetTimesForTicket = GetTimesForTicket;
module.exports.GetTime = GetTime;
module.exports.GetMyTimer = GetMyTimer;
module.exports.GetMyTimes = GetMyTimes;
module.exports.UpdateMyTimerTicket = UpdateMyTimerTicket;
module.exports.UpdateMyTimerTime = UpdateMyTimerTime;
module.exports.PauseTimer = PauseTimer;
module.exports.StopTimer = StopTimer;
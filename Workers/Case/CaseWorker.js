/**
 * Created by Heshan.i on 10/17/2016.
 */

var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var Case = require('dvp-mongomodels/model/CaseManagement').Case;
var CaseConfiguration = require('dvp-mongomodels/model/CaseManagement').CaseConfiguration;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var TicketEvent = require('dvp-mongomodels/model/Ticket').TicketEvent;
var redisHandler = require('../Common/RedisHandler.js');
var util = require('util');

var GetCurrentTicketCount = function(tenant, company, caseConfig, callback){
    logger.info("DVP-LiteTicket.CaseWorker.GetCurrentTicketCount Internal method ");

    var ticketArray = [];
    Ticket.find({
        company: company,
        tenant: tenant,
        active: true,
        isolated_tags: { $all: caseConfig.tagArray },
        status: {$nin: ['closed', 'solved']}
    }, function (err, tickets) {
        if (err) {
            logger.error("Get Tickets By isolated_tags Failed :: " + err);
            callback(err, ticketArray);
        } else {

            if (tickets) {
                for (var i = 0; i < tickets.length; i++) {
                    if (caseConfig.activeTicketTypes && caseConfig.activeTicketTypes.length > 0) {
                        if (caseConfig.activeTicketTypes.indexOf(tickets[i].type) > -1) {
                            logger.info("Ticket Id:: " + tickets[i]._id + " Added to Case");
                            ticketArray.push(tickets[i]._id);
                        }
                    } else {

                        logger.info("Ticket Id:: " + tickets[i]._id + " Added to Case");
                        ticketArray.push(tickets[i]._id);
                    }
                }

            } else {
                logger.info("Get Tickets By isolated_tags Failed");
            }

            callback(undefined, ticketArray);
        }
    });





    /*var searchKey = util.format("CONCURRENT:%d:%d:*:tags_*%s*:*", tenant, company, caseConfRule);
    var ignoreKey = ["CLOSEDTICKET", "SOLVEDTICKET"];
    redisHandler.SearchKeys(searchKey, ignoreKey, function(err, result){
        var currentCount = 0;
        if(err){
            logger.error("GetCurrentTicketCount:: "+err);
            callback(err, currentCount);
        }else{
            if(result && result.length > 0){

                for(var i =0; i < result.length; i++){
                    var count = parseInt(result[i]);
                    currentCount = currentCount + count;
                }

                if(currentCount < 0){
                    logger.info("GetCurrentTicketCount:: currentCount minus set to 0");
                    callback(undefined, 0);
                }else{
                    logger.info("GetCurrentTicketCount:: "+currentCount);
                    callback(undefined, currentCount);
                }

            }else{
                logger.info("GetCurrentTicketCount:: Cannot Find :: "+currentCount);
                callback(undefined, currentCount);
            }
        }
    });*/
};

var CreateNewCase = function(tenant, company, caseConfig, ticketArray, callback){
    logger.info("DVP-LiteTicket.CaseWorker.CreateNewCase Internal method ");

    //var ticketArray = [ticketInfo._id];
    //Ticket.find({
    //    company: company,
    //    tenant: tenant,
    //    active: true,
    //    isolated_tags: { $all: caseConfig.tagArray },
    //    status: {$nin: ['closed', 'solved']}
    //}, function (err, tickets) {
    //    if (err) {
    //        logger.error("Get Tickets By isolated_tags Failed :: "+ err);
    //    } else {
    //
    //        if (tickets) {
    //            for(var i =0; i < tickets.length;i++){
    //                if(caseConfig.activeTicketTypes && caseConfig.activeTicketTypes.length > 0){
    //                    if(caseConfig.activeTicketTypes.indexOf(tickets[i].type) > -1){
    //                        logger.info("Ticket Id:: "+tickets[i]._id +" Added to Case");
    //                        ticketArray.push(tickets[i]._id);
    //                    }
    //                }else{
    //
    //                    logger.info("Ticket Id:: "+tickets[i]._id +" Added to Case");
    //                    ticketArray.push(tickets[i]._id);
    //                }
    //            }
    //
    //        } else {
    //            logger.info("Get Tickets By isolated_tags Failed");
    //        }
    //    }

        var time = new Date();
        var tEvent = TicketEvent({
            type: 'status',
            "author": 'system',
            "create_at": Date.now(),
            body: {
                "message": "System Create Case",
                "time": time
            }
        });

        var caseName = util.format('%s-%d', caseConfig.configurationName, time.getTime());

        var caseInfo = Case({
            created_at: time.toISOString(),
            updated_at: time.toISOString(),
            active: true,
            status: "new",
            caseName: caseName,
            description: caseConfig.description,
            company: company,
            tenant: tenant,
            caseConfiguration: caseConfig._id,
            related_tickets:ticketArray,
            events: [tEvent],
            SLAViolated: false
        });

        caseInfo.save(function (err, caseData) {
            if (err) {
                logger.error("Create Case Failed :: "+ err);
                callback(err, "Create Case Failed");
            }
            else {
                if (caseData) {
                    logger.info("Case Saved Successfully :: "+ caseData);
                    callback(undefined, "Case Saved Successfully");
                }
                else {
                    logger.info("Fail To Save Case :: "+ caseData);
                    callback(undefined, "Fail To Save Case");
                }
            }
        });
    //});
};

var AddTicketToCase = function(tenant, company, caseConf, ticketInfo, callback){
    logger.info("DVP-LiteTicket.CaseWorker.AddTicketToCase Internal method ");
    Case.findOne({company: company, tenant: tenant, caseConfiguration: caseConf._id, active: true}, function (err, caseData) {
        if (err) {
            logger.error("Fail Find Case:: "+ err);
            callback(err, "Fail Find Case");
        }
        else {
            if (caseData) {

                if(caseConf.activeTicketTypes && caseConf.activeTicketTypes.indexOf(ticketInfo.type) > -1) {
                    logger.info("Ticket Id:: " + ticketInfo._id + " Added to Case");


                    var time = new Date().toISOString();
                    var tEvent = TicketEvent({
                        type: 'status',
                        "author": 'system',
                        "create_at": Date.now(),
                        body: {
                            "message": "System Add Ticket To Case " + ticketInfo._id,
                            "time": time,
                            "differences": {}
                        }
                    });

                    caseData.update({
                        "$set": {
                            "updated_at": Date.now()
                        },
                        "$addToSet": {"events": tEvent, "related_tickets": ticketInfo._id}
                    }, function (err, rCase) {
                        if (err) {
                            logger.error("Fail Update Case:: " + err);
                            callback(err, "Fail Update Case");
                        }
                        else {
                            if (rCase) {
                                logger.info("Add Ticket To Case Success:: " + rCase);
                                callback(undefined, "Add Ticket To Case Success");
                            }
                            else {
                                logger.info("Failed To Update Case:: " + caseData._id);
                                callback(undefined, "Failed To Update Case");
                            }
                        }
                    });
                }else{
                    callback(undefined, "Ticket Not Matched");
                }
            }
            else {
                logger.info("Fail Find Case");
                //GetCurrentTicketCount(ticketInfo.tenant, ticketInfo.company, caseConf.configurationRule.replace(/ /g,''), function(err, currentCount){
                GetCurrentTicketCount(ticketInfo.tenant, ticketInfo.company, caseConf, function(err, currentTickets){
                    if(err){
                        callback(err, "Get Current Ticket Count Failed");
                    }else{
                        if(caseConf.threshold && currentTickets.length >= caseConf.threshold){
                            currentTickets.push(ticketInfo._id);
                            CreateNewCase(ticketInfo.tenant, ticketInfo.company, caseConf, currentTickets, function(err, msg){
                                callback(err, msg);
                            });
                        }else{
                            logger.info("Threshold Not Exceeded");
                            callback(undefined, "Threshold Not Exceeded");
                        }
                    }

                });
            }
        }

    });
};

var ExecuteCase = function(ticket, callback){
    logger.info("DVP-LiteTicket.CaseWorker.ExecuteCase Internal method ");
    if(ticket && ticket.isolated_tags && ticket.isolated_tags.length > 0){
        CaseConfiguration.find({
            company: ticket.company,
            tenant: ticket.tenant,
            active: true,
            configurationType: 'automate'
        }, function (err, caseConfigs) {
            if (err) {
                logger.error("Get Case Configurations Failed");
                callback(err, "Get Case Configurations Failed");

            } else {

                if (caseConfigs && caseConfigs.length > 0) {
                    var caseConfToExecute = undefined;
                    for(var i = 0; i < caseConfigs.length; i++){
                        var caseConf = caseConfigs[i];

                        var confRuleItems = caseConf.configurationRule.split(".");
                        if(confRuleItems && confRuleItems.length > 0){
                            var match = [];
                            for (var j =0; j < confRuleItems.length; j++) {
                                if(ticket.isolated_tags.indexOf(confRuleItems[j]) > -1){
                                    match.push(confRuleItems[j]);
                                }
                            }

                            if(match.length === confRuleItems.length){
                                caseConf.tagArray = confRuleItems;
                                caseConfToExecute = caseConf;
                                break;
                            }
                        }
                    }

                    if(caseConfToExecute){
                        AddTicketToCase(ticket.tenant, ticket.company, caseConf, ticket, function(err, msg){
                            callback(err, msg);
                        });
                    }else{
                        logger.info("No Case Configurations Found For Execute");
                        callback(undefined, "No Case Configurations Found For Execute");
                    }

                } else {
                    logger.info("No Case Configurations Found");
                    callback(undefined, "No Case Configurations Found");
                }
            }
        });
    }else{
        logger.info("No Isolated Tags Found in Ticket");
        callback(undefined, "No Isolated Tags Found in Ticket");
    }
};



module.exports.ExecuteCase = ExecuteCase;
/**
 * Created by a on 7/4/2016.
 */

var mongoose = require('mongoose');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var TimeEntry = require('dvp-mongomodels/model/TimeEntry').TimeEntry;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var User = require('dvp-mongomodels/model/User');
var Trigger = require('dvp-mongomodels/model/TicketTrigers').Trigger;
var OrganisationConfig = require('dvp-mongomodels/model/OrganisationConfig');
var messageFormatter = require('dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var q = require('q');
var triggerWorker = require('../Workers/Trigger/TriggerWorker');

function CreateTrigger(req, res) {


    logger.info("DVP-LiteTicket.CreateTrigger Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var data = Trigger({
        title: req.body.title,
        Active: req.body.Active,
        priority: req.body.priority,
        triggerEvent: req.body.triggerEvent,
        created_at: Date.now(),
        updated_at: Date.now(),
        company: company,
        tenant: tenant,
        conditions: req.body.conditions,
        actions: req.body.actions,
        operations: req.body.operations
    });

    data.save(function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Trigger create failed", false, undefined);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "Trigger saved successfully", true, trigger);
        }
        res.end(jsonString);
    });
}

function GetTriggers(req, res) {
    logger.info("DVP-LiteTicket.GetTriggers Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.find({company: company, tenant: tenant}, function (err, triggers) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get GetTriggers Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "Get GetTriggers Success", true, triggers);
            res.end(jsonString);
        }
    });
}

function GetTrigger(req, res) {
    logger.info("DVP-LiteTicket.GetTrigger Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "GetTrigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "GetTrigger Success", true, trigger);
            res.end(jsonString);
        }
    });
}

function DeleteTrigger(req, res) {
    logger.info("DVP-LiteTicket.DeleteTrigger Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "GetTrigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (trigger) {
                trigger.remove(function (err) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete Trigger Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Trigger successfully deleted", true, undefined);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete Trigger Failed, Trigger object is null", false, undefined);
                res.end(jsonString);
            }
        }
    });
}

function UpdateTrigger(req, res) {
    logger.info("DVP-LiteTicket.UpdateTrigger Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Trigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (trigger) {
                trigger.title = req.body.title;
                trigger.Active = req.body.Active;
                trigger.priority = req.body.priority;
                trigger.triggerEvent = req.body.triggerEvent;
                trigger.updated_at = Date.now();
                trigger.conditions = req.body.conditions;
                trigger.actions = req.body.actions;
                trigger.operations = req.body.operations;

                trigger.update(trigger, function (err, newTrigger) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Trigger", false, undefined);
                    }
                    else {
                        if (newTrigger) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Trigger Update Successfully", true, newTrigger);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Trigger Id.", false, newTrigger);
                        }
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Trigger Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
}

function AddFilterAll(req, res) {
    logger.info("DVP-LiteTicket.AddFilterAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Trigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            var allFiler = {field: req.body.field, operator: req.body.operator, value: req.body.value};
            if (trigger.conditions.all && Array.isArray(trigger.conditions.all)) {
                trigger.conditions.all.push(allFiler);
            } else {
                trigger.conditions.all = [allFiler];
            }
            trigger.update(trigger, function (err, newTrigger) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Add Filter All Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Add Filter All Successful", true, newTrigger);
                }
                res.end(jsonString);
            });
        }
    });
}

function RemoveFilterAll(req, res) {
    logger.info("DVP-LiteTicket.RemoveFilterAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Trigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            for (var i = 0; i < trigger.conditions.all.length; i++) {
                if (trigger.conditions.all[i].id == req.params.filterid) {
                    trigger.conditions.all.splice(i, 1);
                    break;
                }
            }
            trigger.update(trigger, function (err, newTrigger) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Delete Filter All Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Delete Filter All Successful", true, newTrigger);
                }
                res.end(jsonString);
            });
        }
    });
}

function GetFiltersAll(req, res) {
    logger.info("DVP-LiteTicket.GetFiltersAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get FiltersAll Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get FiltersAll Successful", true, trigger.conditions.all);
        }
        res.end(jsonString);
    });
}

function AddFilterAny(req, res) {
    logger.info("DVP-LiteTicket.AddFilterAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Trigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            var anyFiler = {field: req.body.field, operator: req.body.operator, value: req.body.value};
            if (trigger.conditions.any && Array.isArray(trigger.conditions.any)) {
                trigger.conditions.any.push(anyFiler);
            } else {
                trigger.conditions.any = [anyFiler];
            }
            trigger.update(trigger, function (err, newTrigger) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Add Filter Any Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Add Filter Any Successful", true, newTrigger);
                }
                res.end(jsonString);
            });
        }
    });
}

function RemoveFilterAny(req, res) {
    logger.info("DVP-LiteTicket.RemoveFilterAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Trigger Failed", false, undefined);
            res.end(jsonString);
        } else {
            for (var i = 0; i < trigger.conditions.any.length; i++) {
                if (trigger.conditions.any[i].id == req.params.filterid) {
                    trigger.conditions.any.splice(i, 1);
                    break;
                }
            }
            trigger.update(trigger, function (err, newTrigger) {
                if (err) {
                    jsonString = messageFormatter.FormatMessage(err, "Delete Filter Any Failed", false, undefined);
                } else {
                    jsonString = messageFormatter.FormatMessage(undefined, "Delete Filter Any Successful", true, newTrigger);
                }
                res.end(jsonString);
            });
        }
    });
}

function GetFiltersAny(req, res) {
    logger.info("DVP-LiteTicket.GetFiltersAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get FiltersAny Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get FiltersAny Successful", true, trigger.conditions.any);
        }
        res.end(jsonString);
    });
}

function AddAction(req, res) {
    logger.info("DVP-LiteTicket.AddAction Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $addToSet: {
            actions: {
                field: req.body.field,
                value: req.body.value
            }
        }
    }, function (err, actions) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Add Action Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Add Action Successful", true, actions);
        }
        res.end(jsonString);
    });
}

function RemoveAction(req, res) {
    logger.info("DVP-LiteTicket.RemoveAction Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $pull: {
            actions: {
                _id: req.params.actionid
            }
        }
    }, function (err, actions) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Action Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Action Successful", true, actions);
        }
        res.end(jsonString);
    });
}

function GetActions(req, res) {
    logger.info("DVP-LiteTicket.GetActions Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Actions Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get Actions Successful", true, trigger.actions);
        }
        res.end(jsonString);
    });
}

function AddOperations(req, res) {
    logger.info("DVP-LiteTicket.AddOperations Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $addToSet: {
            operations: {
                name: req.body.name,
                field: req.body.field,
                value: req.body.value
            }
        }
    }, function (err, operations) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Add Operations Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Add Operations Successful", true, operations);
        }
        res.end(jsonString);
    });
}

function RemoveOperations(req, res) {
    logger.info("DVP-LiteTicket.RemoveOperations Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOneAndUpdate({_id: req.params.id, company: company, tenant: tenant}, {
        $pull: {
            operations: {
                _id: req.params.operationid
            }
        }
    }, function (err, operations) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Operations Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Operations Successful", true, operations);
        }
        res.end(jsonString);
    });
}

function GetOperations(req, res) {
    logger.info("DVP-LiteTicket.GetOperations Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    Trigger.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Operations Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get Operations Successful", true, trigger.operations);
        }
        res.end(jsonString);
    });
}





var getOrgConfig = function (company, tenant) {

    return triggerWorker.GetOrgConfig(company,tenant);
    /*var deferred = q.defer();

    try {
        OrganisationConfig.findOne({company: company, tenant: tenant}, function (err, config) {
            try{
                triggerWorker.TriggerConfig.push(  key: item.company,
     value: item);
            }catch (ex){

            }
            deferred.resolve(config);
        });
    }
    catch (ex) {
        deferred.reject(ex);
    }
    return deferred.promise;*/
};

module.exports.GetTriggerConfiguration = function (req, res) {


    logger.info("GetTriggerConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    getOrgConfig(company, tenant).then(function (config) {
        if (config) {
            jsonString = messageFormatter.FormatMessage(undefined, "GetTrigger Configuration successfully", true, config);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get TriggerCon figuration failed", false, undefined);
        }
        res.end(jsonString);
    }), function (err) {
        jsonString = messageFormatter.FormatMessage(err, "Get Trigger Configuration failed", false, undefined);
        res.end(jsonString);
    };
};

module.exports.CreateTriggerConfiguration = function (req, res) {


    logger.info("CreateTriggerConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    /*var organisationConfig = OrganisationConfig({
        created_at: Date.now(),
        updated_at: Date.now(),
        company: company,
        tenant: tenant,
        highPriority_match: req.body.highPriorityMatch
    });*/

    OrganisationConfig.update({company: company, tenant: tenant}, {
        $set: {
            "company": company,
            "tenant": tenant,
            "highPriority_match":req.body.highPriorityMatch,
            "created_at": Date.now(),
            "updated_at": Date.now()
        }
    }, {upsert: true}, function (err, config) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Create Trigger Configuration failed", false, undefined);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "Create Trigger Configuration successfully", true, config);
        }
        getOrgConfig(company, tenant);
        res.end(jsonString);

    });

    /*organisationConfig.save(function (err, config) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Create Trigger Configuration failed", false, undefined);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "Create Trigger Configuration successfully", true, config);
        }
        getOrgConfig(company, tenant);
        res.end(jsonString);
    });*/
};

module.exports.UpdateTriggerConfiguration = function (req, res) {


    logger.info("UpdateTriggerConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    OrganisationConfig.findOne({company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Organisation Trigger Config Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (trigger) {
                trigger.highPriority_match = req.body.highPriorityMatch;

                trigger.update(trigger, function (err, newTrigger) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update Organisation Trigger Config", false, undefined);
                    }
                    else {
                        if (newTrigger) {
                            jsonString = messageFormatter.FormatMessage(undefined, "Organisation Trigger Config Update Successfully", true, newTrigger);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid Organisation Trigger Config.", false, newTrigger);
                        }
                        getOrgConfig(company, tenant);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Organisation Trigger Config Found", false, undefined);
                res.end(jsonString);
            }
        }
    });

};

module.exports.DeleteTriggerConfiguration = function (req, res) {


    logger.info("UpdateTriggerConfiguration Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    OrganisationConfig.findOne({company: company, tenant: tenant}, function (err, trigger) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Organisation Trigger Config Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (trigger) {
                trigger.remove(function (err) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Delete Organisation Trigger Config", false, undefined);
                    }
                    else {
                        jsonString = messageFormatter.FormatMessage(undefined, "Organisation Trigger Config Delete Successfully", true, newTrigger);
                    }
                    getOrgConfig(company, tenant);
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(err, "No Organisation Trigger Config Found", false, undefined);
                res.end(jsonString);
            }
        }
    });

};


module.exports.CreateTrigger = CreateTrigger;
module.exports.GetTriggers = GetTriggers;
module.exports.GetTrigger = GetTrigger;
module.exports.UpdateTrigger = UpdateTrigger;
module.exports.DeleteTrigger = DeleteTrigger;
module.exports.AddFilterAll = AddFilterAll;
module.exports.RemoveFilterAll = RemoveFilterAll;
module.exports.GetFiltersAll = GetFiltersAll;
module.exports.AddFilterAny = AddFilterAny;
module.exports.RemoveFilterAny = RemoveFilterAny;
module.exports.GetFiltersAny = GetFiltersAny;
module.exports.AddAction = AddAction;
module.exports.RemoveAction = RemoveAction;
module.exports.GetActions = GetActions;
module.exports.AddOperations = AddOperations;
module.exports.RemoveOperations = RemoveOperations;
module.exports.GetOperations = GetOperations;







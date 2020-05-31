/**
 * Created by a on 7/4/2016.
 */

var mongoose = require('mongoose');
var logger = require('dvp-common-lite/LogHandler/CommonLogHandler.js').logger;
var TimeEntry = require('dvp-mongomodels/model/TimeEntry').TimeEntry;
var Ticket = require('dvp-mongomodels/model/Ticket').Ticket;
var SLA = require('dvp-mongomodels/model/SLA').SLA;
var messageFormatter = require('dvp-common-lite/CommonMessageGenerator/ClientMessageJsonFormatter.js');






function CreateSLA(req, res){
    logger.info("DVP-LiteTicket.CreateSLA Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;


    var data = SLA({
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority,
        company: company,
        tenant: tenant,
        filter: req.body.filter,
        matrix: req.body.matrix,
        created_at: Date.now(),
        updated_at: Date.now()
    });

    data.save(function(err, sla){
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "SLA create failed", false, undefined);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "SLA saved successfully", true, sla);
        }
        res.end(jsonString);
    });
}

function GetSLA(req, res){
    logger.info("DVP-LiteTicket.GetSLA Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get SLA Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "Get SLA Success", true, sla);
            res.end(jsonString);
        }
    });
}

function GetSLAs(req, res){
    logger.info("DVP-LiteTicket.GetSLAs Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.find({company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get GetSLAs Failed", false, undefined);
            res.end(jsonString);
        } else {
            jsonString = messageFormatter.FormatMessage(err, "Get GetSLAs Success", true, sla);
            res.end(jsonString);
        }
    });
}

function UpdateSLA(req, res){
    logger.info("DVP-LiteTicket.UpdateSLA Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id, company: company, tenant: tenant}, function(err, sla){
        if(err){
            jsonString = messageFormatter.FormatMessage(err, "Get GetSLA Failed", false, undefined);
            res.end(jsonString);
        }else{
            if(sla){
                sla.description = req.body.description;
                sla.priority = req.body.priority;
                sla.filter = req.body.filter;
                sla.matrix = req.body.matrix;
                sla.updated_at = Date.now();

                sla.update(sla, function (err, newSla) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Fail Update SLA", false, undefined);
                    }
                    else {
                        if (newSla) {
                            jsonString = messageFormatter.FormatMessage(undefined, "SLA Update Successfully", true, newSla);
                        }
                        else {
                            jsonString = messageFormatter.FormatMessage(undefined, "Invalid SLA Id.", false, newSla);
                        }
                    }
                    res.end(jsonString);
                });
            }else{
                jsonString = messageFormatter.FormatMessage(err, "No SLA Found", false, undefined);
                res.end(jsonString);
            }
        }
    });
}

function DeleteSLA(req, res){
    logger.info("DVP-LiteTicket.DeleteSLA Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id, company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get SLA Failed", false, undefined);
            res.end(jsonString);
        } else {
            if (sla) {
                sla.remove(function (err) {
                    if (err) {
                        jsonString = messageFormatter.FormatMessage(err, "Delete SLA Failed", false, undefined);
                    } else {
                        jsonString = messageFormatter.FormatMessage(undefined, "SLA successfully deleted", true, undefined);
                    }
                    res.end(jsonString);
                });
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete SLA Failed, SLA object is null", false, undefined);
                res.end(jsonString);
            }
        }
    });
}

function AddMatrix(req, res){
    logger.info("DVP-LiteTicket.AddMatrix Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOneAndUpdate({_id: req.params.id,company: company, tenant: tenant}, { $addToSet :{
        matrix : {
            priority: req.body.priority,
            criteria: req.body.criteria,
            target: req.body.target,
            threshold:  req.body.threshold,
            on_fail:  req.body.on_fail,
            on_threshold:  req.body.on_threshold
        }}}, function (err, matrices) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Add Matrix Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Add Matrix Successful", true, matrices);
        }
        res.end(jsonString);
    });
}

function DeleteMatrix(req, res){
    logger.info("DVP-LiteTicket.DeleteMatrix Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOneAndUpdate({_id: req.params.id,company: company, tenant: tenant}, { $pull :{
        matrix : {
            _id: req.params.matrixid
        }}}, function (err, matrices) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Delete Matrix Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Delete Matrix Successful", true, matrices);
        }
        res.end(jsonString);
    });
}

function AddFilterAll(req, res){
    logger.info("DVP-LiteTicket.AddFilterAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        var allFiler = {field: req.body.field, operator: req.body.operator, value: req.body.value};
        if(sla.filter.all && Array.isArray(sla.filter.all)) {
            sla.filter.all.push(allFiler);
        }else{
            sla.filter.all = [allFiler];
        }
        sla.update(sla, function (err, newSla) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Add Filter All Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Add Filter All Successful", true, newSla);
            }
            res.end(jsonString);
        });
    });
}

function RemoveFilterAll(req, res){
    logger.info("DVP-LiteTicket.RemoveFilterAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        for(var i = 0; i < sla.filter.all.length; i++){
            if(sla.filter.all[i].id == req.params.filterid) {
                sla.filter.all.splice(i, 1);
                break;
            }
        }
        sla.update(sla, function (err, newSla) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Delete Filter All Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete Filter All Successful", true, newSla);
            }
            res.end(jsonString);
        });
    });
}

function GetFiltersAll(req, res){
    logger.info("DVP-LiteTicket.GetFiltersAll Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get FiltersAll Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get FiltersAll Successful", true, sla.filter.all);
        }
        res.end(jsonString);
    });
}

function AddFilterAny(req, res){
    logger.info("DVP-LiteTicket.AddFilterAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        var anyFiler = {field: req.body.field, operator: req.body.operator, value: req.body.value};
        if(sla.filter.any && Array.isArray(sla.filter.any)) {
            sla.filter.any.push(anyFiler);
        }else{
            sla.filter.any = [anyFiler];
        }
        sla.update(sla, function (err, newSla) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Add Filter Any Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Add Filter Any Successful", true, newSla);
            }
            res.end(jsonString);
        });
    });
}

function RemoveFilterAny(req, res){
    logger.info("DVP-LiteTicket.RemoveFilterAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        for(var i = 0; i < sla.filter.any.length; i++){
            if(sla.filter.any[i].id == req.params.filterid) {
                sla.filter.any.splice(i, 1);
                break;
            }
        }
        sla.update(sla, function (err, newSla) {
            if (err) {
                jsonString = messageFormatter.FormatMessage(err, "Delete Filter Any Failed", false, undefined);
            } else {
                jsonString = messageFormatter.FormatMessage(undefined, "Delete Filter Any Successful", true, newSla);
            }
            res.end(jsonString);
        });
    });
}

function GetFiltersAny(req, res){
    logger.info("DVP-LiteTicket.GetFiltersAny Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Filters Any Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get Filters Any Successful", true, sla.filter.any);
        }
        res.end(jsonString);
    });
}

function GetMatrices(req, res){
    logger.info("DVP-LiteTicket.GetMatrices Internal method ");

    var company = parseInt(req.user.company);
    var tenant = parseInt(req.user.tenant);
    var jsonString;

    SLA.findOne({_id: req.params.id,company: company, tenant: tenant}, function (err, sla) {
        if (err) {
            jsonString = messageFormatter.FormatMessage(err, "Get Matrices Failed", false, undefined);
        } else {
            jsonString = messageFormatter.FormatMessage(undefined, "Get Matrices Successful", true, sla.matrix);
        }
        res.end(jsonString);
    });
}


module.exports.CreateSLA =CreateSLA;
module.exports.GetSLA =GetSLA;
module.exports.GetSLAs =GetSLAs;
module.exports.UpdateSLA = UpdateSLA;
module.exports.DeleteSLA = DeleteSLA;
module.exports.AddMatrix = AddMatrix;
module.exports.DeleteMatrix = DeleteMatrix;
module.exports.AddFilterAll = AddFilterAll;
module.exports.RemoveFilterAll = RemoveFilterAll;
module.exports.AddFilterAny = AddFilterAny;
module.exports.RemoveFilterAny = RemoveFilterAny;
module.exports.GetMatrices = GetMatrices;
module.exports.GetFiltersAll =GetFiltersAll;
module.exports.GetFiltersAny =GetFiltersAny;


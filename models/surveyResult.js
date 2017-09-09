let mongoose = require('mongoose');

let surveyResultSchema = mongoose.Schema({
    clientName: String,
    questionnaireID: String, //version in format of x.yz
    clientChoiceSum: String,    //visible name of survey
    reportTemplate: String, //JSON type string
    created: Date,
});

let SurveyResult = mongoose.model('surveyResult', surveyResultSchema);
module.exports = SurveyResult;
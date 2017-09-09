let mongoose = require('mongoose');

let surveyResultSchema = mongoose.Schema({
    clientName: String,
    questionnaireID: String,
    clientChoice: String,
    reportTemplate: String,
    created: Date,
});

let SurveyResult = mongoose.model('surveyResult', surveyResultSchema);
module.exports = SurveyResult;
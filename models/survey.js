let mongoose = require('mongoose');

let surveySchema = mongoose.Schema({
    surveyName: String,
    clientName: String, //JSON type string
    startDate: Date,
    endDate: Date,
    questionnaireID: String,
    reportTemplate: String
});

let Survey = mongoose.model('survey', surveySchema);
module.exports = Survey;
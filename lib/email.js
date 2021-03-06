let nodemailer = require('nodemailer');

module.exports = function(credentials){

    let mailTransport = nodemailer.createTransport('SMTP',{
        service: 'Gmail',
        auth: {
            user: credentials.gmail.user,
            pass: credentials.gmail.password,
        }
    });

    let from = '"Deep Insight Ltd" <info@deepinsight.com>';
    let errorRecipient = 'youremail@gmail.com';

    return {
        send: function(to, subj, body){
            mailTransport.sendMail({
                from: from,
                to: to,
                subject: subj,
                html: body,
                generateTextFromHtml: true
            }, function(err){
                if(err) console.error('Unable to send email: ' + err);
            });
        },

        emailError: function(message, filename, exception){
            let body = '<h1>Deep Insight Error</h1>' +
                'message:<br><pre>' + message + '</pre><br>';
            if(exception) body += 'exception:<br><pre>' + exception + '</pre><br>';
            if(filename) body += 'filename:<br><pre>' + filename + '</pre><br>';
            mailTransport.sendMail({
                from: from,
                to: errorRecipient,
                subject: 'Deep Insight Site Error',
                html: body,
                generateTextFromHtml: true
            }, function(err){
                if(err) console.error('Unable to send email: ' + err);
            });
        },
    };
};

module.exports = {
  cookieSecret: 'ABCDEGF12345!@#$',
  gmail: {
    user: 'sangseok.lim@gmail.com',
    password: 'lss941102@0'
  },
  mongo: {
    development: {
      connectionString: "mongodb://172.17.0.4:27017/test",
    },
    production: {
      connectionString: "mongodb://172.17.0.4:27017/test"
    }
  },
  authProviders: {
    facebook: {
      development: {
        appId: '119877515330437',
        appSecret: 'b4c37009cc1dbaebe0e49800eb5407b4'
      },
      production: {
        appId: '119877515330437',
        appSecret: 'b4c37009cc1dbaebe0e49800eb5407b4'
      }
    },
    google: {
      development: {
        appId: 'deepinsight_app_id',
        appSecret: 'deepinsight_app_secret'
      },
      production: {
        appId: 'deepinsight_app_id',
        appSecret: 'deepinsight_app_secret'
      }
    }
  }
}
module.exports = {
  cookieSecret: 'ABCDEGF12345!@#$',
  gmail: {
    user: 'sangseok.lim@gmail.com',
    password: 'lss941102@0'
  },
  mongo: {
    development: {
      connectionString: "mongodb://172.17.0.2:27017/test",
    },
    production: {
      connectionString: "mongodb://172.17.0.2:27017/test"
    }
  }
}
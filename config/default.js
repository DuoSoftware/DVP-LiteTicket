module.exports = {
  "DB": {
    "Type":"postgres",
    "User":"duo",
    "Password":"DuoS123",
    "Port":5432,
    "Host":"localhost",
    "Database":"dvpdb"
  },



  "Redis":
  {
    "mode":"sentinel",//instance, cluster, sentinel
    "ip": "45.55.142.207",
    "port": 6389,
    "user": "duo",
    "password": "DuoS123",
    "redisDB":8,
    "sentinels":{
      "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
      "port":16389,
      "name":"redis-cluster"
    }

  },


  "Security":
  {

    "ip" : "45.55.142.207",
    "port": 6389,
    "user": "duo",
    "password": "DuoS123",
    "mode":"sentinel",//instance, cluster, sentinel
    "sentinels":{
      "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
      "port":16389,
      "name":"redis-cluster"
    }
  },

  "DashboardRedis":
  {
    "mode":"sentinel",//instance, cluster, sentinel
    "ip": "45.55.142.207",
    "port": 6389,
    "user": "duo",
    "redisDB":8,
    "password": "DuoS123",
    "sentinels":{
      "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
      "port":16389,
      "name":"redis-cluster"
    }

  },


  //"Redis":
  //{
  //  "ip": "45.55.142.207",
  //  "port": 6389,
  //  "user": "duo",
  //  "password": "DuoS123",
  //  "redisDB":8
  //},
  //
  //"Security":
  //{
  //  "ip" : "45.55.142.207",
  //  "port": 6389,
  //  "user": "duo",
  //  "password": "DuoS123"
  //},
  //
  //
  //"DashboardRedis":
  //{
  //  "ip": "104.131.67.21",
  //  "port": 6379,
  //  "user": "duo",
  //  "password": "DuoS123",
  //  "redisDB":8
  //},

  "Host":
  {
    "resource": "cluster",
    "vdomain": "127.0.0.1",
    "domain": "127.0.0.1",
    "port": "3636",
    "version": "1.0.0.0",
    "HashKey":"ticket"
  },

  "LBServer" : {

    "ip": "192.168.0.101",
    "port": "3636"

  },

  "Mongo":
  {
    "ip":"104.236.231.11",
    "port":"27017",
    "dbname":"dvpdb",
    "password":"DuoS123",
    "user":"duo",
    "replicaset" :"104.236.231.11"
  },



  "RabbitMQ":
  {
    "ip": "45.55.142.207",
    "port": 5672,
    "user": "admin",
    "password": "admin",
    "vhost":'/'
  },

    "Services" : {
      "accessToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo",
      "resourceServiceHost": "resourceservice.app.veery.cloud",
      "resourceServicePort": "8831",
      "resourceServiceVersion": "1.0.0.0",
      "sipuserendpointserviceHost": "sipuserendpointservice.app.veery.cloud",
      "sipuserendpointservicePort": "8831",
      "sipuserendpointserviceVersion": "1.0.0.0",
      "clusterconfigserviceHost": "clusterconfig.app.veery.cloud",
      "clusterconfigservicePort": "8831",
      "clusterconfigserviceVersion": "1.0.0.0",
      "ardsServiceHost": "ardsliteservice.app.veery.cloud",
      "ardsServicePort": "8828",
      "ardsServiceVersion": "1.0.0.0",
      "notificationServiceHost": "notificationservice.app.veery.cloud",
      "notificationServicePort": "8089",
      "notificationServiceVersion": "1.0.0.0",
      "scheduleWorkerHost": "scheduleworker.app.veery.cloud",
      "scheduleWorkerPort": "8080",
      "scheduleWorkerVersion": "1.0.0.0",
      "interactionServiceHost": "interactions.app.veery.cloud",
      "interactionServicePort": "8080",
      "interactionServiceVersion": "1.0.0.0",
      "fileServiceHost": "fileservice.app.veery.cloud",
      "fileServicePort": 5645,
      "fileServiceVersion":"1.0.0.0"
    },

  "Token":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo"



};

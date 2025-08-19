
const AwsService = require('../services/AwsService');
const os = require('os');
const WebStoreDatabase = sails.config.WebStoreDatabase;
const {socketRequestData} = require('../services/WebsocketService');
const {isValidUserGame,escapeChar,isValidUserRole, postRequest} = require('../services/UtilService');
// const md5 = require('md5');
let websocket = typeof sails.config.WebsocketEndPointUrl!='undefined'?sails.config.WebsocketEndPointUrl:false; 
// const { rcGet, rcSet } = require("../services/CacheService");
const currencyUnitRatio = {"BHD": 1000, "IQD": 1000, "JOD": 1000, "KWD": 1000, "LYD": 1000, "MGA": 5, "MRU": 5, "OMR": 1000, "TND": 1000, "VUV": 1};

module.exports = {
    view: async function(req,res){
        try {
            if(req.method == 'GET'){
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    res.redirect('/');
                }
                let adminGames=req.session.adminGames;
                let gameQuery=`SELECT GameID,GameName FROM game_master where Payment_Partner_Allowed=1`;
                let game=(await sails.getDatastore("slave").sendNativeQuery(gameQuery, [])).rows;
                const filteredGame = game.filter(item => adminGames.includes(item.GameID));
                if(typeof req.session.AdminCurrentGame != 'undefined'){
                    res.redirect('/webstores/marketplace?game_id='+req.session.AdminCurrentGame);
                }
                else if(filteredGame.length==1){
                    res.redirect('/webstores/marketplace?game_id='+filteredGame[0].GameID);
                }else{
                    res.view({game:filteredGame});
                }
            }else{
                let game_id=req.body.GameId;
                req.session.AdminCurrentGame = game_id;
                res.redirect('/webstores/marketplace?game_id='+game_id);
            }
        } catch (error) {
            res.redirect('/');
        }
    },
    graph: async function (req,res) {
        let game_id = req.param('game_id');
        if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
            game_id = req.session.AdminCurrentGame;
        }
        let gameServicePermision = await checkServiceOfGame(req, game_id);    
        if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
            if("undefined" == typeof sails.config.supperSetGraph || "undefined" == typeof sails.config.supperSetGraph.storeDashboard || "undefined" == typeof sails.config.supperSetGraph.storeDashboard[game_id]){
                return res.view();
            }
            let t = await postRequest(`${sails.config.supperSetGraph.url}/api/v1/security/login`,{
                password: `${sails.config.supperSetGraph.password}`,
                provider: 'db',
                refresh: true,
                username: `${sails.config.supperSetGraph.userName}`,
            },{'Content-Type': 'application/json'});
            t = JSON.parse(t);
            if(t && 'undefined' != typeof t['access_token']){
                //refresh_token 
                const guestTokenBody = {
                    resources: sails.config.supperSetGraph.storeDashboard[game_id],
                    rls: [],
                    user: {
                    username: 'report-viewer',
                    first_name: 'report-viewer',
                    last_name: 'report-viewer',
                    },
                };
                
                const guestTokenHeaders = {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${t['access_token']}`,
                };
                
                const guestTokenResponse = await postRequest(`${sails.config.supperSetGraph.url}/api/v1/security/guest_token/`, guestTokenBody, guestTokenHeaders);
                const token = JSON.parse(guestTokenResponse);
                if(token && 'undefined' != typeof token['token']){
                    let data={'token':token['token'],'url':sails.config.supperSetGraph.url,'dashboard':sails.config.supperSetGraph.storeDashboard[game_id]}
                    return res.view(data);
                }
            }
            res.view();
        }else{
            return res.redirect('/webstores/marketplace?game_id='+game_id);
        }
    },
    marketplace: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
    
            if (req.method === 'GET') {
                let game_id = req.param('game_id');
    
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
    
                let result = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplace"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                res.view({
                    data: result,
                    game_id_sub_header: game_id,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.marketplace',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
    
            res.redirect('/webstores/view');
        }
    },    
    viewSkuOnMarketplace: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
    
            if (req.method === 'GET') {
                let MarketPlaceGameId = req.param('MarketPlaceGameId');
                let game_id = req.param('game_id');
                let MarketPlaceName = req.param('MarketPlaceName');
    
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
    
                let result = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);    
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"viewSkuOnMarketplace",
                            "marketplacegameid": MarketPlaceGameId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                } else {
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                res.view({
                    data: result,
                    game_id_sub_header: game_id,
                    MarketPlaceName: MarketPlaceName,
                    IsViewerOnly: isViewerOnly,
                    MarketPlaceGameId: MarketPlaceGameId,
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.viewSkuOnMarketplace',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
    
            return res.status(500).send("Internal Server Error");
        }
    },    
    marketplaceStatusChange: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            let status = req.body.updateStatus;
            let MarketPlaceId = req.body.MarketPlaceId;
            let game_id = req.body.game_id;
            if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                game_id = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let reqObj = {
                "action": "updateMarketPlaceStatus",
                "marketPlaceId": MarketPlaceId,
                "updateStatus": status
            }
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');     
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status updated successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.marketplaceStatusChange',
                line: 46,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    mapMarketplaceOnGame: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            let PackageName=req.body.PackageName;
            let MarketPlaceId=req.body.MarketPlaceId;
            let game_id=req.body.game_id;
            if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                game_id = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let AppId=req.body.AppId;
            let reqObj={
                "action":"mapMarketplaceOnGame",
                "packageName":PackageName,
                "marketPlaceId":MarketPlaceId,
            }
            if (AppId != undefined){
                reqObj["MarketPlaceAppId"]=AppId;
            }
            if(typeof req.body.PaymentDeeplink != 'undefined'){
                reqObj["PaymentDeeplink"]=req.body.PaymentDeeplink;
            }
            if(typeof req.body.MarketPlaceGameId != 'undefined' && Number(req.body.MarketPlaceGameId)>0){
                reqObj["MarketPlaceGameId"]=req.body.MarketPlaceGameId;
            }
            if(typeof req.body.SkuPaymentCallback != 'undefined'){
                reqObj["SkuPaymentCallback"]=req.body.SkuPaymentCallback;
            }
            var response =await socketRequestData(req,reqObj,websocket,game_id,'webstore');   
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Marketplace edited successfully.';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.mapMarketplaceOnGame',
                line: 46,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    marketplaceGameStatusChange:async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            let status = req.body.updateStatus;
            var updatedStatus='Disable'
            if(status == 1){
                updatedStatus='Enable'
            }
            let MarketPlaceId = req.body.MarketPlaceId;
            let GameId=req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let reqObj = {
                "action": "updateMarketPlaceGameStatus",
                "marketPlaceId": MarketPlaceId,
                "updateStatus": updatedStatus
            }
            var response =await socketRequestData(req,reqObj,websocket,GameId,'webstore');   
            
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status updated successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.marketplaceStatusChange',
                line: 46,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    createMarketPlace:async function(req, res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id = req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg='User has view access only';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                return res.view();
            }else{
                // let response = await AwsService.lambdaRequest(reqObj,lambdaFunctionName);
                // if(typeof response.Payload != 'undefined'){
                //     let respPayload=JSON.parse(response.Payload);
                //     if(typeof respPayload.body != 'undefined'){
                //         let body=JSON.parse(respPayload.body);
                //         let status=body.resp.Status;
                //         let message=(body.resp.msg != 'undefined')? body.resp.msg : 'Something went wrong.';
                //         if(status==1){
                //             req.session.msg="Insert successful";
                //             return res.redirect('/webstores/marketplace');
                //         }else{
                //             req.session.msg=message
                //             return res.redirect('/webstores/marketplace');
                //         }
                //     }
                // }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/marketplace');
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.createMarketPlace',
                line: 92,
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/marketplace');
        }
    },
    store: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let marketplaceCount=0, marketplaceData=[], result=[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjCount = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var responseCount =await socketRequestData(req,reqObjCount,websocket,game_id,'webstore');   
                    if(typeof responseCount == 'object'){
                        let status=responseCount.Status;
                        if(status==1){
                            marketplaceData = [...responseCount.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjStore = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreCount"
                        }
                    }
                    var responseStore = await socketRequestData(req,reqObjStore,websocket,game_id,'webstore');     
 
                    if(typeof responseStore == 'object'){
                        let status=responseStore.Status;
                        if(status==1){
                            result = [...responseStore.msg]
                        }
                    }
                }
                res.view({data:result,game_id_sub_header:game_id,marketplaceCount:marketplaceCount, IsViewerOnly: isViewerOnly});
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.store',
                line: 110,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    createStore: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id=req.param('game_id');
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }                
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                
                let adminGames=req.session.adminGames;
                let gameQuery=`SELECT GameID,GameName FROM game_master`;
                let game=(await sails.getDatastore("slave").sendNativeQuery(gameQuery, [])).rows;
                let topicnamedata = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreTitle"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            topicnamedata = [...response.msg]
                        }
                    }
                }
                const filteredGame = game.filter(item => adminGames.includes(item.GameID));
                res.view({game:filteredGame,game_id_sub_header:game_id, IsViewerOnly: isViewerOnly, topicnamedata:topicnamedata});
            }else{
                let StoreRefId=req.body.StoreRefId;
                let GameId=req.body.GameId;
                let units = Number(req.body.Units);
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' +  + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let StoreTitle=req.body.StoreTitle;
                let StoreDescription=req.body.StoreDescription;
                let StoreStatus=req.body.StoreStatus;
                let AllAudience=req.body.AllAudience;
                let addMeta = req.body.addMeta;
                let reqObj={
                    "action" : "createStore"
                };
                reqObj["StoreRefId"]=StoreRefId;
                if(StoreTitle != ''){
                    reqObj["StoreTitle"]=StoreTitle;
                }
                if(StoreDescription != ''){
                    reqObj["StoreDescription"]=StoreDescription;
                }
                if(StoreStatus != ''){
                    reqObj["StoreStatus"]=StoreStatus;
                }
                if(typeof addMeta!='undefined' && addMeta == 'on'){
                    let obj = {};
                    for(let i = 0; i < units; i++){
                        let count = i+1;
                        let key = 'Key'+count;
                        let value = 'Value'+count;
                        let inputKey = req.body[key];
                        let inputValue = req.body[value];
                        obj[inputKey]=inputValue;
                    }
                    reqObj['StoreMeta'] = obj;
                }
                if(AllAudience == 1){
                    if(typeof reqObj.StoreMeta!='undefined'){
                        reqObj.StoreMeta['AllAudience']=1;
                    }else{
                        reqObj["StoreMeta"]={
                            'AllAudience':1
                        }
                    }
                }
                reqObj["Source"]="Panel";
                reqObj["AdminID"]=req.session.adminUserId;


                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('StoreImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if(!err && uploadedFiles.length > 0){
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            let storeImages3Name = StoreTitle.replace(/\s/g,'');
                            const Key = `sku/${GameId}/StoreImage/${storeImages3Name+'_'+timestamp}.${accept}`;
                            let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                            if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                                }
                            }
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });

                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                                if (err) 
                                    return reject(`Error uploading to S3: ${err.message}`);
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                                reqObj["StoreImage"] = url;
                                resolve();
                            })
                        }else{
                            resolve();
                        }
                    })
                }));

                Promise.all(promises)
                .then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = 'Insert successful';
                            return res.redirect('/webstores/store?game_id='+GameId);
                        }else{
                            req.session.msg=response.msg;
                            return res.redirect('/webstores/store?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/store?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.createStore',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/store?game_id='+GameId);
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.createStore',
                line: 127,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    storeStatusChange: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let status = req.body.updateStatus;
            let StoreId = req.body.StoreId;
            let GameId = req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action": "updateStoreStatus",
                "StoreId": StoreId,
                "updateStatus": status
            }
            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status changed successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.storeStatusChange',
                line: 218,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    updateStoreData: async function(req,res){
        let isViewerOnly = isViewOnly(req);
        if(isViewerOnly){
            req.session.msg = 'User has view access only';
            return res.status(200).send(false);
        }
        let StoreId=req.body.StoreId;
        let GameId=req.body.GameId;
        if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
            GameId = req.session.AdminCurrentGame;
        }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
            req.session.msg = 'Game is not matching admin selected game.';
            return res.status(200).send(true);
        }
        let StoreTitle=req.body.StoreTitle;
        let StoreDescription=req.body.StoreDescription;
        let StoreMeta=req.body.StoreMeta;
        let StoreUnpublishDate=req.body.StoreUnpublishDate;
        let reqObj={
            "action": "updateStore",
            "StoreId":StoreId,
            "RecLuSource":"Panel"
        }
        if(StoreTitle != ''){
            reqObj["StoreTitle"]=StoreTitle;
        }
        if(StoreDescription != ''){
            reqObj["StoreDescription"]=StoreDescription;
        }
        if(StoreMeta != undefined){
            reqObj["StoreMeta"]=(StoreMeta);
        }
        if(StoreUnpublishDate != '' && StoreUnpublishDate != undefined){
            reqObj["StoreUnpublishDate"]=StoreUnpublishDate+' 23:59:59';
        }
        var response =  await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
        if(typeof response == 'object'){
            let status=response.Status;
            if(status==1){
                req.session.msg = 'Store updated successfully';
                return res.status(200).send(true);
            }else{
                req.session.msg=response.msg;
                return res.status(200).send(false);
            }
        }
        
        req.session.msg='Something went wrong.'
        return res.status(200).send(true);
    },
    sku: async function(req, res) {
        let isViewerOnly = isViewOnly(req);
        try {
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                
                let marketplaceCount = 0, marketplaceData=[], data=[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjCount = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var responseCount = await socketRequestData(req,reqObjCount,websocket,game_id,'webstore');    
                    if(typeof responseCount == 'object'){
                        let status=responseCount.Status;
                        if(status==1){
                            marketplaceData = [...responseCount.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjSku = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuData"
                        }
                    }
                    var responseSku = await socketRequestData(req,reqObjSku,websocket,game_id,'webstore');     
                    if(typeof responseSku == 'object'){
                        let status=responseSku.Status;
                        if(status==1){
                            data = [...responseSku.msg]
                        }
                    }
                }
                if(data.length > 0) {
                    data.forEach((elem) => {
                        try{ elem.Meta = JSON.parse(elem.Meta); }catch(e){ elem.Meta = elem.Meta; }
                        try{ elem.SkuAssets = JSON.parse(elem.SkuAssets); }catch(e){ elem.SkuAssets = elem.SkuAssets; }
                    });
                }

                res.view({
                    data: data,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.sku',
                line: 110,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    
    createSkuOnMarketPlace: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let MarketPlaceId=req.param('MarketPlaceId');
                let MarketPlaceName=req.param('MarketPlaceName');

                let MarketPlaceNameforsku = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (MarketPlaceName.toLowerCase() === 'apple') {
                    if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                        let reqObj = {
                            "action":"getPanelData",
                            "parameters":{
                                "name":"getMarketplaceNameForApple",
                                "marketplacename":MarketPlaceName
                            }
                        }
                        var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                        if(typeof response == 'object'){
                            let status=response.Status;
                            if(status==1){
                                MarketPlaceNameforsku = [...response.msg]
                            }
                        }
                    }
                } else {
                    if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                        let reqObj = {
                            "action":"getPanelData",
                            "parameters":{
                                "name":"getMarketplaceNameForSku",
                                "marketplacename":MarketPlaceName
                            }
                        }
                        var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                        if(typeof response == 'object'){
                            let status=response.Status;
                            if(status==1){
                                MarketPlaceNameforsku = [...response.msg]
                            }
                        }
                    }
                }
                res.view({MarketPlaceId:MarketPlaceId,MarketPlaceName:MarketPlaceName,game_id_sub_header:game_id,MarketPlaceNameforsku:MarketPlaceNameforsku})
            }else{
                let promises=[];
                let MarketPlaceName=req.body.MarketPlaceName;
                let MarketPlaceId=req.body.MarketPlaceId;
                let GameId=req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/marketplace?game_id=' + GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let price=req.body.price;
                let productId=req.body.productId;
                let currency=req.body.currency;
                let video=req.body.video;
                let unit='PAISA';
                if(currency == 'USD'){
                    unit='CENTS';
                }
                let MarketPlaceGameIdData = [], MarketPlaceGameId, duplicateData = [];
                let gameServicePermision = await checkServiceOfGame(req, GameId);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceGameIdData",
                            "marketplaceid":MarketPlaceId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            MarketPlaceGameIdData = [...response.msg]
                        }
                    }
                    if(MarketPlaceGameIdData.length > 0){
                        MarketPlaceGameId = MarketPlaceGameIdData[0].MarketPlaceGameId;
                    }

                    let reqObjDuplicate = {
                        "action":"getPanelData",
                        "parameters":{
                            "name": "getDuplicateMarketplace",
                            "marketplacegameid" :MarketPlaceGameId,
                            "marketplaceproductid": productId
                        }
                    }
                    var responseDuplicate = await socketRequestData(req,reqObjDuplicate,websocket,GameId,'webstore');     
                    if(typeof responseDuplicate == 'object'){
                        let status=responseDuplicate.Status;
                        if(status==1){
                            duplicateData = [...responseDuplicate.msg]
                        }
                    }
                }
                if(duplicateData && duplicateData[0].count > 0){
                    req.session.msg='This MarketPlaceProductId is already Present for this game';
                    return res.redirect('/webstores/marketplace?game_id='+GameId);
                }
                price=price.split(" ");
                let reqObj={
                    "action":"createSkuOnMarketPlace",
                    "MarketPlaceGameId":MarketPlaceGameId,
                    "MarketPlaceProductId":productId,
                    "Price":price[0]*100,
                    "Currency":currency,
                    "Unit":unit
                }
                MarketPlaceName=MarketPlaceName.toLowerCase();
                if((MarketPlaceName == 'google' || MarketPlaceName == 'android' || MarketPlaceName == 'playstore' || MarketPlaceName == 'googleplaystore')){ 
                    reqObj["MarketPlaceProductData"]=JSON.stringify({
                        "localization":[{
                            "title":req.body.Title,
                            "locale":"en-US",
                            "description":req.body.Description
                        }],
                        "defaultPrice": {
                            "unit": unit,
                            "price": price[0],
                            "currency": currency
                        },
                        "purchaseType":req.body.RefPurchaseType,
                        "defaultLanguage":"en-US"
                    })
                }
                else if((MarketPlaceName == 'apple' || MarketPlaceName == 'appstore' || MarketPlaceName == 'ios')){
                    let url, refData=[], refDataCount;
                    let RefDataName=req.body.RefDataName;
                    let gameServicePermision = await checkServiceOfGame(req, GameId);
                    if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                        let reqObj = {
                            "action":"getPanelData",
                            "parameters":{
                                "name": "getRefData",
                                "marketplacerefname": RefDataName,
                                "marketplacegameid": MarketPlaceGameId
                            }
                        }
                        var response =  await socketRequestData(req,reqObj,websocket,GameId,'webstore');        
                        if(typeof response == 'object'){
                            let status=response.Status;
                            if(status==1){
                                refData = [...response.msg]
                            }
                        }
                        if (refData.length > 0) {
                            refDataCount = refData[0].Present;
                        }
                    }
                    if(refDataCount>0){
                        req.session.msg='This Reference Name is already Present for Apple';
                        return res.redirect('/webstores/marketplace?game_id='+GameId);
                    }          
                    promises.push(new Promise((resolve,reject)=>{
                        req.file('RefReviewImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                            if (err || !uploadedFiles.length)
                                return reject(`SERVER ERROR=> RefReviewImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            const Key = `sku/${GameId}/${req.body.productId}/${timestamp}.${accept}`;
                            let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                            if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                                }
                            }
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });

                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                                if (err) 
                                    return reject(`Error uploading to S3: ${err.message}`);                                
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                                reqObj["MarketPlaceRefName"]=RefDataName;
                                reqObj["MarketPlaceProductData"]=JSON.stringify({
                                    "id": req.body.MarketPlaceAppId,
                                    "name":req.body.RefDataName,
                                    "reviewNote":(req.body.RefReviewNote!='')?req.body.RefReviewNote:'',
                                    "reviewImage":{
                                        "url": url
                                    },
                                    "localization":[{
                                        "title":req.body.Title,
                                        "locale":"en-US",
                                        "description":req.body.Description
                                    }],
                                    "defaultPrice": {
                                        "unit": unit,
                                        "price": price[0],
                                        "currency": currency,
                                        "country": (currency == 'USD') ? 'USA' : 'IND'
                                    },
                                    "purchaseType":req.body.RefPurchaseType,
                                    "defaultLanguage":"en-US"
                                })
                                resolve();
                            })
                        })
                    }));
                }
                else if(( MarketPlaceName == 'octrostore' || MarketPlaceName == 'octro' || MarketPlaceName == 'trinitystore' || MarketPlaceName == 'trinity store')){
                    reqObj["uploadStatus"]=1;
                    let MarketPlaceProductData={
                        "purchaseType":req.body.RefPurchaseType,
                    };
                    if(typeof video != 'undefined' && video != ""){
                        MarketPlaceProductData["deeplink"]=video;
                    }
                    reqObj["MarketPlaceProductData"]=JSON.stringify(MarketPlaceProductData);
                }
                Promise.all(promises)
                .then(async() => {
                    var response =await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                    if(typeof response== 'object'){
                        let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                        if(response.Status==1){
                            if(MarketPlaceName == 'apple' || MarketPlaceName == 'appstore' || MarketPlaceName == 'ios' || MarketPlaceName == 'google' || MarketPlaceName == 'android' || MarketPlaceName == 'playstore' || MarketPlaceName == 'googleplaystore'){
                                let skuid=response.msg.MarketPlaceSkuId;
                                var SkuSyncPhpUrl=sails.config.SkuSyncPhpUrl;
                                let Url=SkuSyncPhpUrl+'skuid='+skuid;
                                var publishResponse= await UtilService.getRequest(Url,{});
                                publishResponse=JSON.parse(publishResponse);
                                if(typeof publishResponse.status != 'undefined' && publishResponse.status == 1){
                                    req.session.msg = 'INSERT SUCCESSFUL';
                                }else{
                                    req.session.msg = 'INSERTED, but unable to publish on marketplace.';
                                }
                            }else{
                                req.session.msg = 'INSERT SUCCESSFUL';
                            }
                        }else{
                            req.session.msg = message  ;
                        }
                    }
                })
                .catch((error) => {
                    console.error({
                        error: error,
                        service: 'WebStoreController.createSkuOnMarektPlace',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg = 'Something went wrong';
                })
                .finally(() => {
                    return res.redirect('/webstores/marketplace?game_id=' + GameId);
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.createSkuOnMarketPlace',
                line: 450,
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/marketplace?game_id='+GameId);
        }
    },

    editMarketplaceSku: async function (req,res){
        try {
            if(req.method == 'GET'){

            } else {
                let isViewerOnly = isViewOnly(req);
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.status(200).send(false);
                }
                let MarketPlaceSkuId=req.body.MarketPlaceSkuId;
                let GameId=req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                let reqObj = {
                    "action" : "updateMarketplaceSkuPricing",
                    "MarketPlaceSkuId":MarketPlaceSkuId
                }
                if(typeof req.body.updateStatus != 'undefined'){
                    reqObj['updateStatus'] = Number(req.body.updateStatus);
                }
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = 'Status Changed successfully';
                        return res.status(200).send(true);
                    }else{
                        req.session.msg=response.msg;
                        return res.status(200).send(false);
                    }
                }
                
                req.session.msg='Something went wrong.'
                return res.status(200).send(true);
            }
        } catch (error) {
            req.session.msg='Something went wrong.'
            console.error({
                error: error,
                service: 'WebStoreController.editMarketplaceSku',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },

    changeSkuStatus: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let status = req.body.updateStatus;
            let SkuId=req.body.SkuId;
            let GameId=req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action" : "updateSkuStatus",
                "SkuId":SkuId,
                "updateStatus":status
            }
            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status Changed successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.ChangeSkuStatus',
                line: 335,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    syncSku: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            var SkuSyncPhpUrl=sails.config.SkuSyncPhpUrl;
            let skuid=req.body.skuid;
            let Url=SkuSyncPhpUrl+'skuid='+skuid;
            var body= await UtilService.getRequest(Url,{});
            body=JSON.parse(body);
            try {
                if(typeof body.status != 'undefined' && body.status == 1){
                    req.session.msg='Published Successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg='Cannot publish, something went wrong';
                    return res.status(200).send(false);
                }
            } catch (error) {
                console.error({error: error,service: 'WebStoresController.syncSku',line: 368,error_at: Moment.getTimeForLogs()});
            }
            return res.status(500).send(false);
        } catch (error) {
            console.error({error: error,service: 'WebStoresController.syncSku',line: 363,error_at: Moment.getTimeForLogs()});
            return res.status(500).send(false);
        }
    },
    updateSku: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            if(req.body.SkuStartDate == '' && req.body.SkuExpiryDate == ''){
                req.session.msg="No data to update";
                return res.status(200).send(true);
            }
            let GameId=req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj={    
                "action" : "updateSku",
                "SkuId" : req.body.SkuId,
                "RecLuSource":"Panel"
                
            }
            if(req.body.SkuStartDate != ''){
                reqObj["SkuStartDate"]=req.body.SkuStartDate;
            }
            if(req.body.SkuExpiryDate != ''){
                reqObj["SkuExpiryDate"]=req.body.SkuExpiryDate;
            }
            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'SKU updated successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.updateSku',
                line: 389,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    createSku: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            let AdminID=req.session.adminUserId;
            if(req.method=='GET'){
                let adminGames=req.session.adminGames;
                let gameQuery=`SELECT GameID,GameName FROM game_master`;
                let game=(await sails.getDatastore("slave").sendNativeQuery(gameQuery, [])).rows;
                const filteredGame = game.filter(item => adminGames.includes(item.GameID));
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && typeof req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/sku' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let benefitImageData=[], topicnamedata=[], result =[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjMarketplace = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"skuMarketplaceData"
                        }
                    }
                    var responseMarketplace =await socketRequestData(req,reqObjMarketplace,websocket,game_id,'webstore');      
                    if(typeof responseMarketplace == 'object'){
                        let status=responseMarketplace.Status;
                        if(status==1){
                            result = [...responseMarketplace.msg]
                        }
                    }

                    let reqObjBenefit = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitImageData"
                        }
                    }
                    var responseBenefit = await socketRequestData(req,reqObjBenefit,websocket,game_id,'webstore');  
                    if(typeof responseBenefit == 'object'){
                        let status=responseBenefit.Status;
                        if(status==1){
                            benefitImageData = [...responseBenefit.msg]
                        }
                    }
                    
                    let reqObjTopic = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTopicName"
                        }
                    }
                    var responseTopic = await socketRequestData(req,reqObjTopic,websocket,game_id,'webstore');      
                    if(typeof responseTopic == 'object'){
                        let status=responseTopic.Status;
                        if(status==1){
                            topicnamedata = [...responseTopic.msg]
                        }
                    }
                }
                let resultImageData = {};
                if(benefitImageData.length > 0){
                    benefitImageData.forEach(item => {
                        if (!resultImageData[item.SkuBenefitName]) {
                            resultImageData[item.SkuBenefitName] = [];
                        }
                        resultImageData[item.SkuBenefitName].push({'Link':item.SkuBenefitImageLink,'Name':item.SkuBenefitImageName});
                    });
                }
                res.view({game:filteredGame,data:result,game_id_sub_header:game_id, resultImageData:resultImageData, IsViewerOnly: isViewerOnly,topicnamedata:topicnamedata});
            }else{
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/sku' + (('undefined' != typeof (req.body.GameId)) ? ('?game_id='+(req.body.GameId)) : ''));
                }
                let promises=[];
                let reqObj={
                    "action":"createSku",
                    "SkuData":{
                        "SkuStatus":1,
                        "RecAddBy" : AdminID,
                        "GameId":req.body.GameId,
                        "SkuMultiPurchase":req.body.SkuMultiPurchase,
                        "SkuBenefitDays":req.body.SkuBenefitDays,
                        "RecAddSource":"Panel",
                        "SkuStartDate":(req.body.SkuStartDate!='')?(req.body.SkuStartDate)+" 00:00:00":null,
                        "SkuTitle":req.body.SkuRefLocalizationTitle,
                        "SkuDescription":req.body.SkuRefLocalizationDescription,
                        "SkuMeta":{
                            "skuBaseBenefit":{
                                "currentBenefit":{
                                    "amount":(req.body.baseCurrentAmount).replace(/,/g,''),
                                    "currency":req.body.baseCurrentUrl,
                                    "currencyName":req.body.baseCurrentName
                                },
                                "oldBenefit":{
                                    "amount":(typeof req.body.baseOldAmount != 'undefined') ? req.body.baseOldAmount.replace(/,/g,'') : '',
                                    "currency":(typeof req.body.baseOldUrl != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldUrl : '',
                                    "currencyName":(typeof req.body.baseOldName != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldName : ''
                                }
                            }
                        }
                    }
                }
                let SkuExpiryDate=(req.body.SkuExpiryDate);
                let SkuExpiryTime=(req.body.SkuExpiryTime);
                let SkuStartDate=(req.body.SkuStartDate);
                let SkuStartTime=(req.body.SkuStartTime);
                if(SkuStartDate != '' && SkuStartDate != undefined){
                    SkuStartDate=(SkuStartTime != '' && SkuStartTime != undefined) ? (SkuStartDate+" "+SkuStartTime+":00") : SkuStartDate+" 00:00:00";
                    reqObj.SkuData["SkuStartDate"]=SkuStartDate;
                }
                if(SkuExpiryDate !='' && SkuExpiryDate != undefined){
                    SkuExpiryDate=(SkuExpiryTime != '' && SkuExpiryTime != undefined) ? (SkuExpiryDate+" "+SkuExpiryTime+":00") : SkuExpiryDate+" 23:59:59" ;
                    reqObj.SkuData["SkuExpiryDate"]=SkuExpiryDate;
                }


                if(typeof req.body.saleFlagUrl != 'undefined' && req.body.saleFlagUrl != ''){
                    reqObj.SkuData.SkuMeta.skuImage["saleFlagUrl"]=req.body.saleFlagUrl;
                } 

                let count = req.body.count; 
                if (count > 0) {
                    for (let i = 1; i <= count; i++) {
                        reqObj.SkuData.SkuMeta[`skuExtraBenefit${i}`] = {
                            currentBenefit: {
                                amount: (req.body[`extra${i}CurrentAmount`]).replace(/,/g,'') , 
                                currency: req.body[`extra${i}CurrentUrl`] ,
                                currencyName: req.body[`extra${i}CurrentName`] 
                            },
                            oldBenefit: {
                                amount: (typeof req.body[`extra${i}OldAmount`] !== 'undefined') ? (req.body[`extra${i}OldAmount`]).replace(/,/g,'') : '', 
                                currency: (typeof req.body[`extra${i}OldUrl`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldUrl`] : '', 
                                currencyName: (typeof req.body[`extra${i}OldName`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldName`] : ''
                            }
                        };
                    }
                }
                
                let GameId=req.body.GameId;
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = 'INSERT SUCCESSFUL';
                        return res.redirect('/webstores/sku?game_id=' + GameId);
                    }else{
                        req.session.msg=response.msg;
                        return res.redirect('/webstores/createSku?game_id=' + GameId);
                    }
                }
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.createSku',
                line: 576,
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/createSku');
        }
    },
    publishSku:async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let storeData = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"publishSku"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');       
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            storeData = [...response.msg]
                        }
                    }
                }
                res.view({data:storeData,game_id_sub_header:game_id,IsViewerOnly:isViewerOnly});
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.publishSku',
                line: 720,
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/gratification');
        }
    },
    publishNewSku: async function(req,res){
        try{
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){                
                let game_id=req.param('game_id');
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let StoreId=req.param('StoreId');
                let StoreRefId=req.param('StoreRefId');
                let data = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name": "publishNewSku",
                            "storeid": StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');         
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0){
                    data.forEach((item) => {
                        const skuId = item.SkuId;
    
                        if (!uniqueSkuData[skuId]) {
                        uniqueSkuData[skuId] = {
                            SkuStartDate: item.SkuStartDate,
                            SkuExpiryDate: item.SkuExpiryDate,
                            SkuStatus: item.SkuStatus,
                            Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                        };
                        } 
                    });
                }
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];

                    return {
                    SkuId: parseInt(skuId),
                    SkuStartDate: entry.SkuStartDate,
                    SkuExpiryDate: entry.SkuExpiryDate,
                    SkuStatus: entry.SkuStatus,
                    Titles: entry.Titles,
                    };
                });
                res.view({data:result,StoreId:StoreId,StoreRefId:StoreRefId,game_id_sub_header:game_id,IsViewerOnly: isViewerOnly});
            }else{
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.status(200).send(false);
                }
                let SkuId=req.body.SkuId;
                let StoreId=req.body.StoreId;
                let Locked=req.body.Locked;
                let GameId=req.param('GameId');
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                let reqObj={
                    "action":"mapStoreSku",
                    "SkuId":SkuId,
                    "StoreId":StoreId,
                    "Locked":Locked
                }
                var response =await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
                if(typeof response == 'object'){
                    let status=response.Status;
                    let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                    if(status==1){
                        req.session.msg='Sku mapped successfully'
                            return res.status(200).send(true);
                    }else{
                        req.session.msg=message
                            return res.status(200).send(false);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.status(200).send(true);
            } 
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.publishNewSku',
                line: 770,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    viewMappedSku: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let StoreId=req.param('StoreId');
                let game_id=req.param('game_id');
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let data = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"viewMappedSku",
                            "storeid": StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0){
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                SkuStartDate: item.SkuStartDate,
                                SkuExpiryDate: item.SkuExpiryDate,
                                SkuStatus: item.SkuStatus,
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                            };
                        } 
                    });
                }

                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];

                    return {
                    SkuId: parseInt(skuId),
                    SkuStartDate: entry.SkuStartDate,
                    SkuExpiryDate: entry.SkuExpiryDate,
                    SkuStatus: entry.SkuStatus,
                    Titles: entry.Titles,
                    };
                });
                res.view({data:result,StoreId:StoreId,game_id_sub_header:game_id, IsViewerOnly: isViewerOnly});
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.viewMappedSku',
                line: 788,
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/publishSku');
        }
    },
    addSkuOnStore: async function(req,res){
        try{
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let StoreId=req.param('StoreId');
                let StoreRefId=req.param('StoreRefId');                
                let game_id=req.param('game_id');
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let data = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"addSkuOnStore",
                            "storeid":StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0) {
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                SkuStartDate: item.SkuStartDate,
                                SkuExpiryDate: item.SkuExpiryDate,
                                StoreSkuStatus: item.StoreSkuStatus,
                                SkuStatus: item.SkuStatus,
                                storeSkuPresent: item.storeSkuPresent,
                                Locked: item.Locked,
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                            };
                        } 
                    });
                }
                
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];

                    return {
                    SkuId: parseInt(skuId),
                    SkuStartDate: entry.SkuStartDate,
                    SkuExpiryDate: entry.SkuExpiryDate,
                    SkuStatus: entry.SkuStatus,
                    StoreSkuStatus: entry.StoreSkuStatus,
                    storeSkuPresent: entry.storeSkuPresent,
                    Titles: entry.Titles,
                    Locked: entry.Locked,
                    };
                });
                res.view({data:result,StoreId:StoreId,StoreRefId:StoreRefId,game_id_sub_header:game_id, IsViewerOnly: isViewerOnly});
            }else{
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.status(200).send(false);
                }
                let SkuId=req.body.SkuId;
                let StoreId=req.body.StoreId;
                let GameId=req.param('GameId');
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                let reqObj={
                    "action":"mapStoreSku",
                    "SkuId":SkuId,
                    "StoreId":StoreId
                }
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');     
                if(typeof response == 'object'){
                    let status=response.Status;
                    let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                    if(status==1){
                        req.session.msg='Sku mapped successfully'
                            return res.status(200).send(true);
                    }else{
                        req.session.msg=message
                            return res.status(200).send(false);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.status(200).send(true);
            }
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.addSkuOnStore',
                line: 1160,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    marketplaceSkuMap: async function(req,res){
        try {
          let isViewerOnly = isViewOnly(req);
          if(req.method == 'GET'){
            let game_id=req.param('game_id');
            let redirectUrl = await checkServiceOfGame(req,game_id,1);
            if(redirectUrl!=false) return res.redirect(redirectUrl);

            if(typeof req.param('StoreId') != 'undefined'){
                let publish = false;
                let containsMapping = false;
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let StoreId=req.param('StoreId') ;
                let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku=[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuStore",
                            "storeid":StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagData"
                        }
                    }
                    var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');     
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            TagData = [...responseTag.msg]
                        }
                    }

                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryData"
                        }
                    }
                    var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');  
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            CategoryData = [...responseCategory.msg]
                        }
                    }

                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageData"
                        }
                    }
                    var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');     
                    if(typeof responsePromo == 'object'){
                        let status=responsePromo.Status;
                        if(status==1){
                            ImageData = [...responsePromo.msg]
                        }
                    }

                    let reqObjMarketPlace = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceSkuData"
                        }
                    }
                    var responseMarketPlace = await socketRequestData(req,reqObjMarketPlace,websocket,game_id,'webstore');      
                    if(typeof responseMarketPlace == 'object'){
                        let status=responseMarketPlace.Status;
                        if(status==1){
                            MarketplaceSku = [...responseMarketPlace.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0) {
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if(item.MarketPlaceSkuStatus == '1'){
                            publish = true;
                        }
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuId: item.StoreSkuId,
                                StoreTitle: item.StoreTitle,
                                MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                                MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                                PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                                TagName: (item.TagName != null)?[item.TagName]:[],
                                CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                                Price: (item.Price != null)?[item.Price]:[],
                                Currency: (item.Currency != null)?[item.Currency]:[],
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                                MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                                MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                                StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                                OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                            };
                        }else{
                            uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                            uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                            uniqueSkuData[skuId].Price.push(item.Price);
                            uniqueSkuData[skuId].Currency.push(item.Currency);
                            uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                            uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                            uniqueSkuData[skuId].TagName.push(item.TagName);
                            let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                            uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                            uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                            uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                            uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                        } 
                    });
                }

                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    if(entry.MarketPlaceProductId.length > 0){
                        containsMapping = true;
                    }
                    return {
                        SkuId: parseInt(skuId),
                        StoreSkuId: entry.StoreSkuId,
                        StoreTitle: entry.StoreTitle,
                        MarketPlaceName: entry.MarketPlaceName,
                        MarketPlaceProductId: entry.MarketPlaceProductId,
                        Currency: entry.Currency,
                        Price: entry.Price,
                        Titles: entry.Titles,
                        PromoImageName: entry.PromoImageName,
                        TagName: entry.TagName,
                        CategoryName: entry.CategoryName,
                        MarketPlaceProductData: entry.MarketPlaceProductData,
                        MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                        StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                        OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                    };
                });
                const resultObject = MarketplaceSku.reduce((acc, item) => {
                    const marketplaceName = item.MarketPlaceName;
                    if (!acc[marketplaceName]) {
                    acc[marketplaceName] = [];
                    }
                    acc[marketplaceName].push(item);
                    return acc;
                }, {});
                res.view({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, published:publish, StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly});
            }else{
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let result =[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreData"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                res.view({data:result,game_id_sub_header:game_id, IsViewerOnly: isViewerOnly});
            }
          } else {
            let publish = false;
            let containsMapping = false;
            let game_id=req.param('game_id');
            let StoreId=(typeof req.body.StoreId!= 'undefined')?req.body.StoreId:req.param('StoreId') ;
            let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku = [];
            let gameServicePermision = await checkServiceOfGame(req, game_id);
            if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getSkuStore",
                        "storeid": StoreId
                    }
                }
                var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        data = [...response.msg]
                    }
                }

                let reqObjTag = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getTagData"
                    }
                }
                var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');   
                if(typeof responseTag == 'object'){
                    let status=responseTag.Status;
                    if(status==1){
                        TagData = [...responseTag.msg]
                    }
                }

                let reqObjCategory = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getCategoryData"
                    }
                }
                var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');    
                if(typeof responseCategory == 'object'){
                    let status=responseCategory.Status;
                    if(status==1){
                        CategoryData = [...responseCategory.msg]
                    }
                }

                let reqObjPromo = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getPromoImageData"
                    }
                }
                var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');      
                if(typeof responsePromo == 'object'){
                    let status=responsePromo.Status;
                    if(status==1){
                        ImageData = [...responsePromo.msg]
                    }
                }

                let reqObjMarketPlace = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getMarketplaceSkuData"
                    }
                }
                var responseMarketPlace = await socketRequestData(req,reqObjMarketPlace,websocket,game_id,'webstore');    
                if(typeof responseMarketPlace == 'object'){
                    let status=responseMarketPlace.Status;
                    if(status==1){
                        MarketplaceSku = [...responseMarketPlace.msg]
                    }
                }
            }
            const uniqueSkuData = {};
            if(data.length > 0){
            data.forEach((item) => {
                const skuId = item.SkuId;
                if(item.MarketPlaceSkuStatus == '1'){
                    publish = true;
                }
                if (!uniqueSkuData[skuId]) {
                    uniqueSkuData[skuId] = {
                        StoreSkuId: item.StoreSkuId,
                        StoreTitle: item.StoreTitle,
                        MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                        MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                        PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                        TagName: (item.TagName != null)?[item.TagName]:[],
                        CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                        Price: (item.Price != null)?[item.Price]:[],
                        Currency: (item.Currency != null)?[item.Currency]:[],
                        Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                        MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                        MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                        StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                        OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                    };
                }else{
                    uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                    uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                    uniqueSkuData[skuId].Price.push(item.Price);
                    uniqueSkuData[skuId].Currency.push(item.Currency);
                    uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                    uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                    uniqueSkuData[skuId].TagName.push(item.TagName);
                    let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                    uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                    uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                    uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                    uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                } 
            });
            }

            const result = Object.keys(uniqueSkuData).map((skuId) => {
                const entry = uniqueSkuData[skuId];
                if(entry.MarketPlaceProductId.length > 0){
                    containsMapping = true;
                }
                return {
                    SkuId: parseInt(skuId),
                    StoreSkuId: entry.StoreSkuId,
                    StoreTitle: entry.StoreTitle,
                    MarketPlaceName: entry.MarketPlaceName,
                    MarketPlaceProductId: entry.MarketPlaceProductId,
                    Currency: entry.Currency,
                    Price: entry.Price,
                    Titles: entry.Titles,
                    PromoImageName: entry.PromoImageName,
                    TagName: entry.TagName,
                    CategoryName: entry.CategoryName,
                    MarketPlaceProductData: entry.MarketPlaceProductData,
                    MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                    StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                    OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                };
            });
            const resultObject = MarketplaceSku.reduce((acc, item) => {
                const marketplaceName = item.MarketPlaceName;
                if (!acc[marketplaceName]) {
                  acc[marketplaceName] = [];
                }
                acc[marketplaceName].push(item);
                return acc;
            }, {});
            res.view({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, published:publish,StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly});
          } 
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.marketplaceSkuMap',
                line: 1250,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    mappingOfMarketplaceSku: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                let StoreId=req.param('StoreId');
                let StoreTitle=req.param('StoreTitle');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let gameServicePermision = await checkServiceOfGame(req,game_id);
                res.view({ game_id_sub_header: game_id, GameServiceAllowed: gameServicePermision, StoreId:StoreId, StoreTitle: StoreTitle, IsViewerOnly: isViewerOnly});
            } else {
                let game_id=req.param('game_id');
                let StoreId=req.param('StoreId');
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let publish = false;
                let containsMapping = false;
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku=[], BackgroundImageData = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuStore",
                            "storeid":StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagData"
                        }
                    }
                    var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');     
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            TagData = [...responseTag.msg]
                        }
                    }

                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryData"
                        }
                    }
                    var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');  
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            CategoryData = [...responseCategory.msg]
                        }
                    }

                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageData"
                        }
                    }
                    var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');     
                    if(typeof responsePromo == 'object'){
                        let status=responsePromo.Status;
                        if(status==1){
                            ImageData = [...responsePromo.msg]
                        }
                    }

                    let reqObjBackground = {
                        "action": "getPanelData",
                        "parameters": {
                            "name": "getBackgroundImageData"
                        }
                    }
                    var responseBackground = await socketRequestData(req,reqObjBackground,websocket,game_id,'webstore');
                    if(typeof responseBackground == 'object'){
                        let status=responseBackground.Status;
                        if(status==1){
                            BackgroundImageData = [...responseBackground.msg]
                        }
                    }

                    let reqObjMarketPlace = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceSkuData"
                        }
                    }
                    var responseMarketPlace = await socketRequestData(req,reqObjMarketPlace,websocket,game_id,'webstore');      
                    if(typeof responseMarketPlace == 'object'){
                        let status=responseMarketPlace.Status;
                        if(status==1){
                            MarketplaceSku = [...responseMarketPlace.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0) {
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if(item.MarketPlaceSkuStatus == '1'){
                            publish = true;
                        }
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuId: item.StoreSkuId,
                                StoreTitle: item.StoreTitle,
                                SkuMeta: (item.SkuMeta != null) ? JSON.parse(item.SkuMeta) : {},
                                MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                                MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                                PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                                BackgroundImageName: (item.BackgroundImageName != null)?[item.BackgroundImageName]:[],
                                TagName: (item.TagName != null)?[item.TagName]:[],
                                CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                                Price: (item.Price != null)?[item.Price]:[],
                                Currency: (item.Currency != null)?[item.Currency]:[],
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                                Description: (typeof item.SkuDescription != 'undefined') ? item.SkuDescription : '',
                                MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                                MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                                StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                                OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                            };
                        }else{
                            uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                            uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                            uniqueSkuData[skuId].Price.push(item.Price);
                            uniqueSkuData[skuId].Currency.push(item.Currency);
                            uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                            uniqueSkuData[skuId].BackgroundImageName.push(item.BackgroundImageName);
                            uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                            uniqueSkuData[skuId].TagName.push(item.TagName);
                            let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                            uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                            uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                            uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                            uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                        } 
                    });
                }

                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    if(entry.MarketPlaceProductId.length > 0){
                        containsMapping = true;
                    }
                    return {
                        SkuId: parseInt(skuId),
                        StoreSkuId: entry.StoreSkuId,
                        StoreTitle: entry.StoreTitle,
                        SkuMeta: entry.SkuMeta,
                        MarketPlaceName: entry.MarketPlaceName,
                        MarketPlaceProductId: entry.MarketPlaceProductId,
                        Currency: entry.Currency,
                        Price: entry.Price,
                        Titles: entry.Titles,
                        Description: entry.Description,
                        PromoImageName: entry.PromoImageName,
                        BackgroundImageName: entry.BackgroundImageName,
                        TagName: entry.TagName,
                        CategoryName: entry.CategoryName,
                        MarketPlaceProductData: entry.MarketPlaceProductData,
                        MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                        StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                        OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                    };
                });
                const resultObject = MarketplaceSku.reduce((acc, item) => {
                    const marketplaceName = item.MarketPlaceName;
                    if (!acc[marketplaceName]) {
                    acc[marketplaceName] = [];
                    }
                    acc[marketplaceName].push(item);
                    return acc;
                }, {});
                return res.status(200).send({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, BackgroundImageData:BackgroundImageData, published:publish, StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly});
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.mappingOfMarketplaceSku',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    publishStore: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let StoreId = req.body.StoreId;
            let GameId=req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action" : "publishStoreOfGame",
                "StoreId":StoreId
            }
            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                if(status==1){
                    req.session.msg='Store published successfully'
                        return res.status(200).send(true);
                }else{
                    req.session.msg=message
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.publishStore',
                line: 1380,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    updateMarketplaceSkuMappingStatus: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let StoreSkuId = req.body.StoreSkuId;
            let GameId=req.body.GameId;
            let Status=req.body.Status;
            let StoreId=req.body.StoreId; 
            let MarketplaceSkuId = req.body.MarketplaceSkuId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action" : "updateMarketplaceStoreSkuStatus",
                "StoreSkuId":Number(StoreSkuId),
                "Status":Number(Status),
                "MarketplaceSkuId":Number(MarketplaceSkuId),
                "StoreId":Number(StoreId)
            }
            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                if(status==1){
                    req.session.msg='sku mapping status updated successfully'
                        return res.status(200).send(true);
                }else{
                    req.session.msg=message
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.updateMarketplaceSkuMappingStatus',
                line: 1422,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    editMarketplaceStoreSkuMapping: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let StoreSkuMarketplaceId = req.body.StoreSkuMarketplaceId;
            let GameId=req.body.GameId;
            let MarketplaceSkuPromoImage=req.body.MarketplaceSkuPromoImage;
            let SkuBackgroundImage = req.body.SkuBackgroundImage;
            let MarketplaceSkuCategory=req.body.MarketplaceSkuCategory;
            let MarketplaceSkuTag=req.body.MarketplaceSkuTag;
            let MarketplaceSkuId = req.body.MarketplaceSku;
            let OldMarketplaceSku = req.body.OldMarketplaceSku;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action" : "updateMarketplaceStoreSkuMapping",
                "StoreSkuMarketplaceId":Number(StoreSkuMarketplaceId),
                "MarketplaceSkuId":Number(MarketplaceSkuId)
            }
            if(typeof MarketplaceSkuPromoImage != 'undefined' && Number(MarketplaceSkuPromoImage) != 0){
                reqObj['MarketplaceSkuPromoImage']=Number(MarketplaceSkuPromoImage);
            }
            if(typeof MarketplaceSkuCategory != 'undefined'){
                reqObj['MarketplaceSkuCategory']=Number(MarketplaceSkuCategory);
            }
            if(typeof MarketplaceSkuTag != 'undefined'){
                reqObj['MarketplaceSkuTag']=Number(MarketplaceSkuTag);
            }
            if(typeof OldMarketplaceSku != 'undefined'){
                reqObj['OldMarketplaceSku']=Number(OldMarketplaceSku);
            }
            if(typeof SkuBackgroundImage != 'undefined'){
                reqObj['SkuBackgroundImage']=Number(SkuBackgroundImage);
            }
            var response =await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                if(status==1){
                    return res.status(200).send(true);
                }else{
                    req.session.msg=message
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.editMarketplaceStoreSkuMapping',
                line: 1477,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    mapMarketplaceSkuStore: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let GameId=req.body.GameId;
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let StoreSkuId = req.body.StoreSkuId;
            let MarketplaceSku=req.body.MarketplaceSku;
            let SkuTag=req.body.MarketplaceSkuTag;
            let SkuCategory=req.body.MarketplaceSkuCategory;
            let SkuPromoImage=req.body.MarketplaceSkuPromoImage;
            let SkuBackgroundImage=req.body.MarketplaceSkuBackgorundImageId;
            let OldMarketplaceSkuId=req.body.OldMarketplaceSkuId; 
            let reqObj = {
                "action" : "updateStoreSkuMarketplaceMapping",
                "MarketplaceSku":MarketplaceSku,
                "StoreSkuId":StoreSkuId
            }
            if(SkuTag != ''){
                reqObj['SkuTag']=SkuTag
            }
            if(SkuCategory != ''){
                reqObj['SkuCategory']=SkuCategory
            }
            if(SkuPromoImage != ''){
                reqObj['SkuPromoImage']=SkuPromoImage
            }
            if(OldMarketplaceSkuId != ''){
                reqObj['OldMarketplaceSkuId']=OldMarketplaceSkuId
            }
            if(SkuBackgroundImage != ''){
                reqObj['SkuBackgroundImage']=SkuBackgroundImage
            }
            let response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
            if(typeof response == 'object'){
                let status=response.Status;
                let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                if(status==1){
                    // req.session.msg='Store Sku Marketplace mapped successfully'
                    return res.status(200).send({success:true});
                }else{
                    // req.session.msg=message
                    return res.status(200).send({success: false});
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.mapMarketplaceSkuStore',
                line: 1308,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    updateSkuStoreStatus: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let status = req.body.updateStatus;
            let SkuId = req.body.SkuId;
            let StoreId = req.body.StoreId;
            let game_id = req.body.GameId;
            if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                game_id = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action": "updateStoreSkuStatus",
                "SkuId": SkuId,
                "updateStatus": status,
                "StoreId": StoreId
            }
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status updated successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.updateSkuStoreStatus',
                line: 1560,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    lockSkuOnStore: async function(req,res){
        try{
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let SkuId=req.body.SkuId;
            let StoreId=req.body.StoreId;
            let Locked=req.body.Locked;
            let GameId=req.param('GameId');
            if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                GameId = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj={
                "action":"lockSkuOnStore",
                "SkuId":SkuId,
                "StoreId":StoreId,
                "Locked":Locked
            }
            var response =  await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
            if(typeof response == 'object'){
                let status=response.Status;
                let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                if(status==1){
                    req.session.msg='Sku locked status updated successfully.'
                        return res.status(200).send(true);
                }else{
                    req.session.msg=message
                        return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.lockSkuOnStore',
                line: 1627,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    tag: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                
                let marketplaceCount = 0; let marketplaceData = [], result = [], usedTags = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var response = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');     
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            marketplaceData = [...response.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllTagData"
                        }
                    }
                    var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');     
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            result = [...responseTag.msg]
                        }
                    }
                    
                    let reqObjDistinctTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getDistinctTagId"
                        }
                    }
                    var responseDistinctTag = await socketRequestData(req,reqObjDistinctTag,websocket,game_id,'webstore');     
                    if(typeof responseDistinctTag == 'object'){
                        let status=responseDistinctTag.Status;
                        if(status==1){
                            usedTags = [...responseDistinctTag.msg]
                        }
                    }
                }
    
                let userTagList = [];
                if(usedTags.length > 0) {
                    usedTags.map((item) => { userTagList.push(item.SkuTagId); });
                }
                
                let finalList = [];
                if(result.length > 0){
                    result.forEach((item) => {
                        if (!userTagList.includes(item.TagId)) {
                            item['UpdateAllowed'] = 1;
                        } else {
                            item['UpdateAllowed'] = 0;
                        }
                        finalList.push(item);
                    });
                }
                res.view({
                    data: finalList,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.tag',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    }
    ,
    updateConfigurationStatus: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let status = req.body.Status;
            let TagId = (typeof req.body.TagId != 'undefined')? req.body.TagId:0;
            let CategoryId = (typeof req.body.CategoryId != 'undefined')? req.body.CategoryId:0;
            let ImageId = (typeof req.body.PromoImageId != 'undefined')? req.body.PromoImageId:0;
            let SkuBenefitId = (typeof req.body.SkuBenefitId != 'undefined')? req.body.SkuBenefitId:0;
            let GratificationId = (typeof req.body.GratificationId != 'undefined')? req.body.GratificationId:0;
            let BackgroundImageId = (typeof req.body.BackgroundImageId != 'undefined')? req.body.BackgroundImageId:0;
            let game_id = req.body.GameId;
            if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                game_id = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action": "updateConfigurationStatus",
                "UpdateStatus": status
            }
            if(TagId != 0){
                reqObj["Type"]="tag";
                reqObj["Id"]=TagId
            }else if(CategoryId != 0){
                reqObj["Type"]="category";
                reqObj["Id"]=CategoryId;
            }else if(ImageId != 0){
                reqObj["Type"]="promoimage";
                reqObj["Id"]=ImageId;
            } else if(SkuBenefitId != 0){
                reqObj["Type"]="benefit";
                reqObj["Id"]=SkuBenefitId;
            } else if(GratificationId != 0){
                reqObj["Type"]="gratificationconfig";
                reqObj["Id"]=GratificationId;
            } else if(BackgroundImageId != 0){
                reqObj["Type"]="backgroundimage";
                reqObj["Id"]=BackgroundImageId;
            } else {
                req.session.msg="Can only update category, image or tag.";
                return res.status(200).send(false);
            }

            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Status updated successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.updateConfigurationStatus',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    createTag: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/tag' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let result = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllTagNames = [];
                if(result.length > 0){
                    result.forEach(item=>{AllTagNames.push(item.TagName)});
                }
                res.view({data:AllTagNames,game_id_sub_header:game_id});
            }
             else {
                let TagName = req.body.TagName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/tag?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/tag' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let Status = req.body.Status;
                let reqObj={
                    "action" : "createTag",
                    "Status":Status,
                    "TagName":TagName
                };
                if(Description != ''){
                    reqObj["Description"]=Description;
                }
                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('TagImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if (err || !uploadedFiles.length)
                            return reject(`SERVER ERROR=> TagIamge >>> Error: ${err ? err.message : 'No files uploaded'}`);
                        const file = uploadedFiles[0];
                        const fs = require('fs');
                        const AWS = require('aws-sdk');
                        const Body = fs.readFileSync(file.fd);
                        const timestamp = new Date().getTime();
                        let accept = file.fd.split(".").pop();
                        const Key = `sku/${GameId}/TagImage/${TagName+'_'+timestamp}.${accept}`;
                        let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                        if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                            awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                            awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                            awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                            if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                            }
                        }
                        AWS.config.update({
                            accessKeyId: awsAccessId,
                            secretAccessKey: awsSecretIdKey,
                            region: awsRegion
                        });

                        let imageType = accept.toLowerCase();
                        let imageContentType = 'image/';
                        if(imageType == 'jpeg' || imageType == 'jpg'){
                            imageContentType += 'jpeg';
                        }else if(imageType == 'tiff' || imageType == 'tif'){
                            imageContentType += 'tiff';
                        }else if(imageType == 'ico'){
                            imageContentType += 'x-icon';
                        }else if(imageType == 'svg'){
                            imageContentType += 'svg+xml';
                        }else{
                            imageContentType += imageType;
                        }

                        (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                            if (err) 
                                return reject(`Error uploading to S3: ${err.message}`);
                            url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                            reqObj["TagImage"]=url;
                            resolve();
                        })
                    })
                }));
                Promise.all(promises)
                .then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');   
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = 'Insert successful';
                            return res.redirect('/webstores/tag?game_id='+GameId);
                        }else{
                            req.session.msg=response.msg;
                            return res.redirect('/webstores/tag?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/tag?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.createTag',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/tag?game_id='+GameId);
                })
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createTag',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    category: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let marketplaceCount = 0; let marketplaceData = [], result = [], usedCategory = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');     
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            marketplaceData = [...response.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllCategoryData"
                        }
                    }
                    var responseCategory =await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');   
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            result = [...responseCategory.msg]
                        }
                    }

                    let reqObjDistinctCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getDistinctCategoryId"
                        }
                    }
                    var responseDistinctCategory = await socketRequestData(req,reqObjDistinctCategory,websocket,game_id,'webstore'); 
                    if(typeof responseDistinctCategory == 'object'){
                        let status=responseDistinctCategory.Status;
                        if(status==1){
                            usedCategory = [...responseDistinctCategory.msg]
                        }
                    }
                }
    
                let userCategoryList = [];
                if(usedCategory.length > 0) {
                    usedCategory.map((item) => { userCategoryList.push(item.SkuCategoryId); });
                }
                let finalList = [];
                if(result.length > 0){
                    result.forEach((item) => {
                        if (!userCategoryList.includes(item.CategoryId)) {
                            item['UpdateAllowed'] = 1;
                        } else {
                            item['UpdateAllowed'] = 0;
                        }
                        finalList.push(item);
                    });
                }
    
                res.view({
                    data: finalList,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.category',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    createCategory: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/category' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllCategoryNames = [];
                if(result.length > 0){
                    result.forEach(item=>{AllCategoryNames.push(item.CategoryName)}); 
                }
                res.view({data:AllCategoryNames,game_id_sub_header:game_id});
            } else {
                let CategoryName = req.body.CategoryName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/category?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/category' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let Status = req.body.Status;
                let reqObj={
                    "action" : "createCategory",
                    "Status":Status,
                    "CategoryName":CategoryName
                };
                if(Description != ''){
                    reqObj["Description"]=Description;
                }
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = 'Insert successful';
                        return res.redirect('/webstores/category?game_id='+GameId);
                    }else{
                        req.session.msg=response.msg;
                        return res.redirect('/webstores/category?game_id='+GameId);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/category?game_id='+GameId);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createCategory',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    benefitType: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
    
            if (req.method === 'GET') {
                let game_id = req.param('game_id');
    
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
    
                if (!websocket || sails.config.SkuImageS3Bucket === undefined || sails.config.WebStoreDatabase === undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let marketplaceCount = 0; let marketplaceData = [], result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            marketplaceData = [...response.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjBenefit = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllBenefitData"
                        }
                    }
                    var responseBenefit = await socketRequestData(req,reqObjBenefit,websocket,game_id,'webstore');      
                    if(typeof responseBenefit == 'object'){
                        let status=responseBenefit.Status;
                        if(status==1){
                            result = [...responseBenefit.msg]
                        }
                    }
                }
                res.view({
                    data: result,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.benefitType',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    getBenefitImage: async function(req,res){
        try {
            if(req.method == 'GET'){
                let SkuBenefitId = req.param('SkuBenefitId');
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitImage",
                            "skubenefitid" : SkuBenefitId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllBenefitNames = [];
                if(result.length > 0){
                    result.forEach(item=>{AllBenefitNames.push({'Name':item.SkuBenefitImageName, 'Image':item.SkuBenefitImageLink, 'Status':item.SkuBenefitImageStatus})});
                }
                res.status(200).send(JSON.stringify(AllBenefitNames));
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.getBenefitImage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    createBenefitType: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefitType' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllBenefitNames = [];
                if(result.length > 0) {
                    result.forEach(item=>{AllBenefitNames.push(item.SkuBenefitName)});
                }    
                res.view({data:AllBenefitNames,game_id_sub_header:game_id});
            } else {
                let BenefitName = req.body.BenefitName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/benefitType?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefitType' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let Status = req.body.Status;
                let reqObj={
                    "action" : "createBenefitType",
                    "Status":Status,
                    "BenefitTypeName":BenefitName
                };
                if(Description != ''){
                    reqObj["Description"]=Description;
                }
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = 'Insert successful';
                        return res.redirect('/webstores/benefitType?game_id='+GameId);
                    }else{
                        req.session.msg=response.msg;
                        return res.redirect('/webstores/benefitType?game_id='+GameId);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/benefitType?game_id='+GameId);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createBenefitType',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    promoImage: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
    
            if (req.method === 'GET') {
                let game_id = req.param('game_id');
    
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
    
                if (!websocket || sails.config.SkuImageS3Bucket === undefined || sails.config.WebStoreDatabase === undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let marketplaceCount = 0; let marketplaceData = [], promoImages = [], usedPromoImages = [], bkgImages = [], usedBkgImages =[];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            marketplaceData = [...response.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllPromoImageData"
                        }
                    }
                    var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');   
                    if(typeof responsePromo == 'object'){
                        let status=responsePromo.Status;
                        if(status==1){
                            promoImages = [...responsePromo.msg]
                        }
                    }

                    let reqObjDistinctPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getDistinctPromoImageId"
                        }
                    }
                    var responseDistinctPromo =await socketRequestData(req,reqObjDistinctPromo,websocket,game_id,'webstore');       
                    if(typeof responseDistinctPromo == 'object'){
                        let status=responseDistinctPromo.Status;
                        if(status==1){
                            usedPromoImages = [...responseDistinctPromo.msg]
                        }
                    }

                    let reqObjBkg = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllBackgroundImageData"
                        }
                    }
                    var responseBkg = await socketRequestData(req,reqObjBkg,websocket,game_id,'webstore');
                    if(typeof responseBkg == 'object'){
                        let status=responseBkg.Status;
                        if(status==1){
                            bkgImages = [...responseBkg.msg]
                        }
                    }
                    let reqObjDistinctBkg = {   
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getDistinctBackgroundImageId"
                        }
                    }
                    var responseDistinctBkg = await socketRequestData(req,reqObjDistinctBkg,websocket,game_id,'webstore');
                    if(typeof responseDistinctBkg == 'object'){
                        let status=responseDistinctBkg.Status;
                        if(status==1){
                            usedBkgImages = [...responseDistinctBkg.msg]
                        }
                    }
                }
                let usedPromoImageList=[], finalList=[];
                if(usedPromoImages.length > 0){
                    usedPromoImageList = usedPromoImages.map(item => item.ImageId);
                }   
                let usedBkgImageList=[];
                if(usedBkgImages.length > 0){
                    usedBkgImageList = usedBkgImages.map(item => item.ImageId);
                }  
                if(promoImages.length > 0){
                    finalList = promoImages.map(item => {
                        item['UpdateAllowed'] = !usedPromoImageList.includes(item.ImageId) ? 1 : 0;
                        return item;
                    });
                }
                if(bkgImages.length > 0){
                    bkgImages.forEach(item => {
                        item['UpdateAllowed'] = !usedBkgImageList.includes(item.ImageId) ? 1 : 0;
                        finalList.push(item);
                    });
                }
    
                res.view({
                    data: finalList,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.promoImage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },    
    createSkuPromoImage: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllPromoImagetNames = [];
                if(result.length > 0) {
                    result.forEach(item=>{AllPromoImagetNames.push(item.PromoImageName)});
                }    
                res.view({data:AllPromoImagetNames,game_id_sub_header:game_id});
            } else {
                let PromoImageName = req.body.PromoImageName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let Status = req.body.Status;

                let reqObj={
                    "action" : "createPromoImage",
                    "Status":Status,
                    "PromoImageName":PromoImageName
                };
                if(Description != ''){
                    reqObj["Description"]=Description;
                }
                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('PromoImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if (err || !uploadedFiles.length)
                            return reject(`SERVER ERROR=> PromoImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                        const file = uploadedFiles[0];
                        const fs = require('fs');
                        const AWS = require('aws-sdk');
                        const Body = fs.readFileSync(file.fd);
                        const timestamp = new Date().getTime();
                        let accept = file.fd.split(".").pop();
                        let PromoImageNameUrl = PromoImageName.replace(/\s/g,'');
                        const Key = `sku/${GameId}/PromoImage/${PromoImageNameUrl+'_'+timestamp}.${accept}`;
                        let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                        if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                            awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                            awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                            awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                            if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                            }
                        }
                        AWS.config.update({
                            accessKeyId: awsAccessId,
                            secretAccessKey: awsSecretIdKey,
                            region: awsRegion
                        });

                        let imageType = accept.toLowerCase();
                        let imageContentType = 'image/';
                        if(imageType == 'jpeg' || imageType == 'jpg'){
                            imageContentType += 'jpeg';
                        }else if(imageType == 'tiff' || imageType == 'tif'){
                            imageContentType += 'tiff';
                        }else if(imageType == 'ico'){
                            imageContentType += 'x-icon';
                        }else if(imageType == 'svg'){
                            imageContentType += 'svg+xml';
                        }else{
                            imageContentType += imageType;
                        }

                        (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                            if (err) 
                                return reject(`Error uploading to S3: ${err.message}`);
                            url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                            reqObj["PromoImageLink"]=url;
                            resolve();
                        })
                    })
                }));
                Promise.all(promises)
                .then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');   
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = 'Insert successful';
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        }else{
                            req.session.msg=response.msg;
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.createSkuPromoImage',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                })
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createSkuPromoImage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    createSkuBackgroundImage: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    req.session.msg = 'Config Values not Available';
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBackgroundImageName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllBackgroundImagetNames = [];
                if(result.length > 0) {
                    result.forEach(item=>{AllBackgroundImagetNames.push(item.BackgroundImageName)});
                }    
                res.view({data:AllBackgroundImagetNames,game_id_sub_header:game_id});
            } else { 
                let BackgroundImageName = req.body.BackgroundImageName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let Status = req.body.Status;

                let reqObj={
                    "action" : "createBackgroundImage",
                    "Status":Status,
                    "BackgroundImageName":BackgroundImageName
                };
                if(Description != ''){
                    reqObj["Description"]=Description;
                }
                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('BackgroundImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if (err || !uploadedFiles.length)
                            return reject(`SERVER ERROR=> BackgroundImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                        const file = uploadedFiles[0];
                        const fs = require('fs');
                        const AWS = require('aws-sdk');
                        const Body = fs.readFileSync(file.fd);
                        const timestamp = new Date().getTime();
                        let accept = file.fd.split(".").pop();
                        let BackgroundImageNameUrl = BackgroundImageName.replace(/\s/g,'');
                        const Key = `sku/${GameId}/SkuBackgroundImage/${BackgroundImageNameUrl+'_'+timestamp}.${accept}`;
                        let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                        if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                            awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                            awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                            awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                            if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                            }
                        }
                        AWS.config.update({
                            accessKeyId: awsAccessId,
                            secretAccessKey: awsSecretIdKey,
                            region: awsRegion
                        });

                        let imageType = accept.toLowerCase();
                        let imageContentType = 'image/';
                        if(imageType == 'jpeg' || imageType == 'jpg'){
                            imageContentType += 'jpeg';
                        }else if(imageType == 'tiff' || imageType == 'tif'){
                            imageContentType += 'tiff';
                        }else if(imageType == 'ico'){
                            imageContentType += 'x-icon';
                        }else if(imageType == 'svg'){
                            imageContentType += 'svg+xml';
                        }else{
                            imageContentType += imageType;
                        }

                        (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                            if (err) 
                                return reject(`Error uploading to S3: ${err.message}`);
                            url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                            reqObj["BackgroundImageLink"]=url;
                            resolve();
                        })
                    })
                }));
                Promise.all(promises).then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');   
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = 'Insert successful';
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        }else{
                            req.session.msg=response.msg;
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.createSkuBackgroundImage',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                })
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createSkuPromoImage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    addSkuMappingOnStore: async function(req,res){
        try{
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let StoreId=req.param('StoreId');
                let StoreRefId=req.param('StoreRefId');
                let data = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"addSkuMappingOnStore",
                            "storeid": StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0) {
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuStatus: item.StoreSkuStatus,
                                SkuStatus: item.SkuStatus,
                                storeSkuPresent: item.storeSkuPresent,
                                Locked: item.Locked,
                                OrderIndex: item.OrderIndex,
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                            };
                        } 
                    });
                }
                
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    return {
                        SkuId: parseInt(skuId),
                        SkuStatus: entry.SkuStatus,
                        StoreSkuStatus: entry.StoreSkuStatus,
                        storeSkuPresent: entry.storeSkuPresent,
                        Titles: entry.Titles,
                        Locked: entry.Locked,
                        OrderIndex: entry.OrderIndex
                    };
                });
                let oldSkus = [];
                result.filter((entry)=>{if(entry.storeSkuPresent == 1 && entry.StoreSkuStatus == 1) oldSkus.push(entry)});
                oldSkus.sort((a,b)=>a.OrderIndex - b.OrderIndex);
                res.view({data:result,StoreId:StoreId,StoreRefId:StoreRefId,game_id_sub_header:game_id, oldSkus:oldSkus});
            }else{
                let SkuList = req.body.SkuList;
                let StoreId=req.body.StoreId;
                let StoreRefId=req.body.StoreRefId; 
                let GameId=req.param('GameId');
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let reqObj={
                    "action":"mapStoreSku",
                    "StoreId":StoreId,
                    "Type":"insert"
                }
                if(typeof SkuList == 'undefined' || SkuList == ''){
                    req.session.msg='No Sku found';
                    return res.redirect('/webstores/addSkuMappingOnStore?game_id='+GameId+'&StoreId='+StoreId+'&StoreRefId='+StoreRefId);
                }
                reqObj['SkuList']=JSON.parse(SkuList);
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                    if(status==1){
                        req.session.msg='Sku mapped successfully'
                        return res.redirect('/webstores/store?game_id='+GameId);
                    }else{
                        req.session.msg=message
                        return res.redirect('/webstores/store?game_id='+GameId);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/store?game_id='+GameId);
            }
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.addSkuMappingOnStore',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    updateSkuStoreMapping: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let StoreId=req.param('StoreId');
                let StoreRefId=req.param('StoreRefId');
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let data = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"updateSkuStoreMapping",
                            "storeid": StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0) {
                    data.forEach((item) => {
                        const skuId = item.SkuId;

                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuStatus: item.StoreSkuStatus,
                                SkuStatus: item.SkuStatus,
                                storeSkuPresent: item.storeSkuPresent,
                                Locked: item.Locked,
                                OrderIndex: item.OrderIndex,
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                            };
                        } 
                    });
                }    
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    return {
                        SkuId: parseInt(skuId),
                        SkuStatus: entry.SkuStatus,
                        StoreSkuStatus: entry.StoreSkuStatus,
                        storeSkuPresent: entry.storeSkuPresent,
                        Titles: entry.Titles,
                        Locked: entry.Locked,
                        OrderIndex: entry.OrderIndex
                    };
                });
                result.sort((a,b) => a.OrderIndex - b.OrderIndex);
                res.view({data:result,StoreId:StoreId,StoreRefId:StoreRefId,game_id_sub_header:game_id});
            }else{
                let SkuList = req.body.SkuList;
                let StoreId=req.body.StoreId;
                let StoreRefId=req.body.StoreRefId; 
                let GameId=req.param('GameId');
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let reqObj={
                    "action":"mapStoreSku",
                    "StoreId":StoreId,
                    "Type":"update"
                }
                if(typeof SkuList == 'undefined' || SkuList == ''){
                    req.session.msg='No Sku found';
                    return res.redirect('/webstores/updateSkuStoreMapping?game_id='+GameId+'&StoreId='+StoreId+'&StoreRefId='+StoreRefId);
                }
                reqObj['SkuList']=JSON.parse(SkuList);
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                    if(status==1){
                        req.session.msg='Sku mapped successfully'
                        return res.redirect('/webstores/store?game_id='+GameId);
                    }else{
                        req.session.msg=message
                        return res.redirect('/webstores/store?game_id='+GameId);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/store?game_id='+GameId);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.addSkuMappingOnStore',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    gratificationConfig: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
    
            if (req.method === 'GET') {
                let game_id = req.param('game_id');
    
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
    
                if (!websocket || sails.config.SkuImageS3Bucket === undefined || sails.config.WebStoreDatabase === undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/view');
                }                
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let marketplaceCount = 0; let marketplaceData = [], gratificationConfigs = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceCount"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            marketplaceData = [...response.msg]
                        }
                    }
                    if (marketplaceData.length > 0 && marketplaceData != undefined) {
                        marketplaceCount = marketplaceData[0].MarketPlaceId;
                    }

                    let reqObjConfig = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getAllGratificationConfigData"
                        }
                    }
                    var responseConfig =await socketRequestData(req,reqObjConfig,websocket,game_id,'webstore');  
                    if(typeof responseConfig == 'object'){
                        let status=responseConfig.Status;
                        if(status==1){
                            gratificationConfigs = [...responseConfig.msg]
                        }
                    }
                }
                res.view({
                    data: gratificationConfigs,
                    game_id_sub_header: game_id,
                    marketplaceCount: marketplaceCount,
                    IsViewerOnly: isViewerOnly
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.gratificationConfig',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    createNewGratification: async function(req, res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/view');
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/gratificationconfig' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getGratificationConfigName"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllGratificationName = [];
                if(result.length > 0) {
                    result.forEach(item=>{AllGratificationName.push(item.GratificationName)});
                }    
                res.view({data:AllGratificationName,game_id_sub_header:game_id});
            }else{
                let GratificationName = req.body.GratificationName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/gratificationconfig?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/gratificationconfig' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let reqObj={
                    "action" : "createNewGratification",
                    "GratificationName":GratificationName,
                    "GratificationJson":[]
                };
                if(Description != ''){
                    reqObj["GratificationDescription"]=Description;
                }
                let MultiplierCount = Number(req.body.MultiplierCount);
                let MultiplierLevelCount = (typeof req.body.MultiplierLevelCount != 'undefined')? JSON.parse(req.body.MultiplierLevelCount):{};
                for(let i = 1; i<= MultiplierCount; i++){
                    let newMultiplier={
                        "MultiplierName" : req.body['MultiplierName'+i],
                        "Multiplier" : {}
                    }
                    let levelCount = MultiplierLevelCount[i];
                    for(let j = 1; j<= levelCount; j++ ){
                        newMultiplier.Multiplier['Level'+j] = req.body['MultiplierLevel'+i+'-'+j];
                    }
                    reqObj.GratificationJson.push(newMultiplier);
                }
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = 'Insert successful';
                        return res.redirect('/webstores/gratificationconfig?game_id='+GameId);
                    }else{
                        req.session.msg=response.msg;
                        return res.redirect('/webstores/gratificationconfig?game_id='+GameId);
                    }
                }
                req.session.msg='Something went wrong.'
                return res.redirect('/webstores/gratificationconfig?game_id='+GameId);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.createNewGratification',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    addBenefitImage: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let SkuBenefitId=req.param('SkuBenefitId');
                let SkuBenefitName=req.param('SkuBenefitName'); 
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/view');
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuBenefitImageName",
                            "skubenefitid":SkuBenefitId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                let AllBenefitImageName = [];
                if(result.length > 0){
                    result.forEach(item=>{AllBenefitImageName.push(item.SkuBenefitImageName)});
                }    
                res.view({data:AllBenefitImageName,game_id_sub_header:game_id,SkuBenefitName:SkuBenefitName,SkuBenefitId:SkuBenefitId});
            }else{
                let SkuBenefitImageName = req.body.SkuBenefitImageName;
                let SkuBenefitId = req.body.SkuBenefitId;
                let Description = req.body.SkuBenefitImageDescription;
                let GameId = req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/benefittype?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let Status = 1;
                let reqObj={
                    "action" : "createSkuBenefitImageName",
                    "Status":Status,
                    "SkuBenefitImageName":SkuBenefitImageName,
                    "SkuBenefitId":SkuBenefitId
                };
                if(typeof Description != 'undefined' && Description != ''){
                    reqObj["Description"]=Description;
                }
                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('SkuBenefitImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if (err || !uploadedFiles.length)
                            return reject(`SERVER ERROR=> SkuBenefitImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                        const file = uploadedFiles[0];
                        const fs = require('fs');
                        const AWS = require('aws-sdk');
                        const Body = fs.readFileSync(file.fd);
                        const timestamp = new Date().getTime();
                        let accept = file.fd.split(".").pop();
                        const Key = `sku/${GameId}/SkuBenefitImage/${SkuBenefitImageName+'_'+timestamp}.${accept}`;
                        let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                        if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                            awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                            awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                            awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                            if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                            }
                        }
                        AWS.config.update({
                            accessKeyId: awsAccessId,
                            secretAccessKey: awsSecretIdKey,
                            region: awsRegion
                        });

                        let imageType = accept.toLowerCase();
                        let imageContentType = 'image/';
                        if(imageType == 'jpeg' || imageType == 'jpg'){
                            imageContentType += 'jpeg';
                        }else if(imageType == 'tiff' || imageType == 'tif'){
                            imageContentType += 'tiff';
                        }else if(imageType == 'ico'){
                            imageContentType += 'x-icon';
                        }else if(imageType == 'svg'){
                            imageContentType += 'svg+xml';
                        }else{
                            imageContentType += imageType;
                        }

                        (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                            if (err) 
                                return reject(`Error uploading to S3: ${err.message}`);
                            url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                            reqObj["PromoImageLink"]=url;
                            resolve();
                        })
                    })
                }));
                Promise.all(promises)
                .then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = 'Insert successful';
                            return res.redirect('/webstores/benefittype?game_id='+GameId);
                        }else{
                            req.session.msg=response.msg;
                            return res.redirect('/webstores/benefittype?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/benefittype?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.addbenefitimage',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/benefittype?game_id='+GameId);
                })
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.addbenefitimage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    addPrice: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }
            let Price = req.body.Price;
            let MarketPlaceSkuId = req.body.MarketPlaceSkuId;
            let game_id = req.body.game_id;
            if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                game_id = req.session.AdminCurrentGame;
            }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.status(200).send(true);
            }
            let reqObj = {
                "action": "addMarketplaceSkuPrice",
                "MarketPlaceSkuId": MarketPlaceSkuId,
                "SkuInrPricing": {
                    "prices":{
                        "IN":{
                            "currency":"INR",
                            "priceMicros":Number(Price)*1000000
                        }
                    }
                }
            }
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    req.session.msg = 'Price added successfully';
                    return res.status(200).send(true);
                }else{
                    req.session.msg=response.msg;
                    return res.status(200).send(false);
                }
            }
            req.session.msg='Something went wrong.'
            return res.status(200).send(true);
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.addPrice',
                line: 3350,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    duplicateStore: async function(req, res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let StoreId = req.param('StoreId');
                let GameId = req.param('game_id');
                if('undefined' == typeof GameId && 'undefined' != typeof req.session.AdminCurrentGame){
                    GameId = req.session.AdminCurrentGame;
                }else if('undefined' != typeof req.session.AdminCurrentGame && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,GameId,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let editStore = req.param('edit');
                let editDuplicateStore = req.param('editduplicate');
                if(('undefined' == typeof editStore && 'undefined' == typeof editDuplicateStore) || ('undefined' != typeof editStore && 'undefined' != typeof editDuplicateStore)){
                    req.session.msg = 'Something went wrong, Please try again';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                let actionType;
                if('undefined' != typeof editStore){
                    actionType = 'edit';
                }else if('undefined' != typeof editDuplicateStore){
                    actionType = 'duplicate';
                }else{
                    req.session.msg = 'Something went wrong, Please try again';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                let gameServicePermision = await checkServiceOfGame(req, GameId);
                let selectResp = [], topicnamedata = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjStore = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreIdData",
                            "storeid":StoreId
                        }
                    }
                    var responseStore = await socketRequestData(req,reqObjStore,websocket,GameId,'webstore');     
                    if(typeof responseStore == 'object'){
                        let status=responseStore.Status;
                        if(status==1){
                            selectResp = [...responseStore.msg]
                        }
                    }

                    let reqObjTitle = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreTitle"
                        }
                    }
                    var responseTitle =await socketRequestData(req,reqObjTitle,websocket,GameId,'webstore');     
                    if(typeof responseTitle == 'object'){
                        let status=responseTitle.Status;
                        if(status==1){
                            topicnamedata = [...responseTitle.msg]
                        }
                    }
                }
                if('undefined' == typeof selectResp || selectResp.length == 0){
                    req.session.msg = 'No Store found for this StoreId';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                selectResp = selectResp[0];

                let allAudience;
                try{
                    allAudience = ('undefined' != typeof JSON.parse(selectResp.StoreMeta).AllAudience) ? JSON.parse(selectResp.StoreMeta).AllAudience : 0;
                }catch(e){
                    allAudience = 0;
                }

                return res.view({game_id_sub_header:GameId, StoreId: StoreId, StoreRefId:selectResp.StoreRefId, StoreImage:selectResp.StoreImage, StoreTitle:selectResp.StoreTitle, StoreDescription:selectResp.StoreDescription, StoreMeta:selectResp.StoreMeta, AllAudience: allAudience, StoreStatus:selectResp.StoreStatus, ActionType: actionType,topicnamedata:topicnamedata});
            }else{
                let GameId=req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/store' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }

                let actionType = (req.body.ActionType).toLowerCase();
                let storeId = req.body.StoreId;
                let storeRefId = req.body.StoreRefId || '';
                // let storeImage = req.body.StoreImage || '';
                let storeTitle = req.body.StoreTitle || '';
                let storeDescription = req.body.StoreDescription || '';
                let units = Number(req.body.Units);
                let addMeta = req.body.addMeta;
                let allAudience = req.body.AllAudience || '';
                let storeStatus = req.body.StoreStatus || '';
                let DuplicateSku = req.body.DuplicateSku;
                let adminId = req.session.adminUserId;
                let apiSource = 'Panel';

                let reqObj = {
                    AdminID: adminId,
                    Source: apiSource
                }
                if(actionType == 'edit'){
                    reqObj.action = 'updateStore';
                    reqObj.StoreId = storeId;
                }else if(actionType == 'duplicate'){
                    reqObj.action = 'createStore';
                    if(DuplicateSku == 1){
                        reqObj['AddStoreSkuMapping']=storeId;
                    }
                }else{
                    req.session.msg = 'Something went wrong, Please try again';
                    return res.redirect('/webstores/store?game_id='+GameId);
                }                
                if(storeTitle != ''){
                    reqObj.StoreTitle = storeTitle;
                }
                if(storeRefId != ''){
                    reqObj.StoreRefId = storeRefId;
                }
                // if(storeImage != ''){
                //     reqObj.StoreImage = storeImage;
                // }
                if(storeDescription != ''){
                    reqObj.StoreDescription = storeDescription;
                }
                if(storeStatus != ''){
                    reqObj.StoreStatus = storeStatus;
                }
                if(typeof addMeta!='undefined' && addMeta == 'on'){
                    let obj = {};
                    for(let i = 0; i < units; i++){
                        let count = i+1;
                        let key = 'Key'+count;
                        let value = 'Value'+count;
                        let inputKey = req.body[key];
                        let inputValue = req.body[value];
                        obj[inputKey]=inputValue;
                    }
                    reqObj['StoreMeta'] = obj;
                }
                if(addMeta != 'on'){
                    reqObj['StoreMeta'] = {};
                }
                if((/^\d+$/).test(allAudience)){
                    allAudience = Number(allAudience);
                    if(allAudience == 1){
                        if('undefined' != typeof reqObj.StoreMeta){
                            reqObj.StoreMeta.AllAudience = 1
                        }else{
                            reqObj.StoreMeta = { AllAudience: 1 };
                        }
                    }else{
                        if('undefined' != typeof reqObj.StoreMeta){
                            reqObj.StoreMeta.AllAudience = 0
                        }else{
                            reqObj.StoreMeta = { AllAudience: 0 };
                        }
                    }
                }

                
                let promises=[];
                promises.push(new Promise((resolve,reject)=>{
                    req.file('StoreImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                        if(!err && uploadedFiles.length > 0){
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            let storeImages3Name = storeTitle.replace(/\s/g, '');
                            const Key = `sku/${GameId}/StoreImage/${storeImages3Name+'_'+timestamp}.${accept}`;
                            let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                            if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                                }
                            }
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });

                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                                if (err) 
                                    return reject(`Error uploading to S3: ${err.message}`);
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                                reqObj["StoreImage"] = url;
                                resolve();
                            });
                        }else{
                            resolve();
                        }
                    })
                }));

                Promise.all(promises)
                .then(async () => {
                    let response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            req.session.msg = ((req.body.ActionType).toLowerCase() == 'duplicate')?'Insert successful':'Edit successful';
                            return res.redirect('/webstores/store?game_id='+GameId);
                        }else{
                            req.session.msg = ('undefined' != typeof response.msg) ? response.msg : 'Something went wrong';
                            return res.redirect('/webstores/store?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/store?game_id='+GameId);
                }).catch((error)=>{
                    console.error({
                        error: error,
                        service: 'WebStoreController.duplicateStore',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/store?game_id='+GameId);
                });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.duplicateStore',
                line: 127,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    Updatecategory: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                let CategoryId = req.param('CategoryId');
                let actionType = req.param('actionType');

                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/category?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/category' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let resultname = [], result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjName = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryName"
                        }
                    }
                    var responseName = await socketRequestData(req,reqObjName,websocket,game_id,'webstore');   
                    if(typeof responseName == 'object'){
                        let status=responseName.Status;
                        if(status==1){
                            resultname = [...responseName.msg]
                        }
                    }

                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryIdData",
                            "categoryid":CategoryId
                        }
                    }
                    var responseCategory =await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');  
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            result = [...responseCategory.msg]
                        }
                    }
                }
                let AllCategoryNames = [];
                if(resultname.length > 0){
                    resultname.forEach(item=>{AllCategoryNames.push(item.CategoryName)});
                }    
                res.view({result:result[0],data:AllCategoryNames,game_id_sub_header:game_id,actionType:actionType,CategoryId:CategoryId});        
            } else {
                let CategoryName = req.body.CategoryName;
                let Description = req.body.Description;
                let CategoryId = req.body.CategoryId;
                let GameId = req.body.GameId;
                let actionType = req.body.actionType;
            
                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                } 
                else if (typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/category?game_id=' + GameId);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/category' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
            
                let Status = req.body.Status;
                let reqObj = {
                    "action": actionType,
                    "Status": Status,
                };
            
                if (actionType === 'editSkuCategory') {
                    reqObj['SkuCategoryId'] = CategoryId;
                    reqObj['SkuCategoryDescription'] = Description;
                    reqObj['SkuCategoryName'] = CategoryName;
                    
                  
                } else if (actionType === 'createCategory') {
                    reqObj["Description"] = Description;
                    reqObj["CategoryName"] = CategoryName;
                }
                try {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                    if (typeof response === 'object') {
                        let status = response.Status;
                        if (status === 1) {
                            req.session.msg = (actionType === 'createCategory') ? 'Category creation successful' : 'Category edit successful';
                        } else {
                            req.session.msg = response.msg;
                        }
                    } else {
                        req.session.msg = 'Unexpected response format.';
                    }
                } catch (error) {
                    req.session.msg = 'Something went wrong.';
                }
            
                return res.redirect('/webstores/category?game_id=' + GameId);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.Updatecategory',
                line: new Error().stack.split('\n')[1].trim(),
                error_at: new Date().toISOString()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    syncAllSkuOnMarketPlace: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(isViewerOnly){
                req.session.msg = 'User has view access only';
                return res.status(200).send(false);
            }            
            if(!isValidUserRole(req,['SUPER_ADMIN','ADMIN'])){
                req.session.msg = "Only Super Admin or Admin can sync marketplace";
                return res.status(200).send(false);
            }
            if('undefined' == typeof sails.config.SkuSyncPhpUrl){
                req.session.msg='Something went wrong, config not set';
                return res.status(200).send(false);
            }
            let SkuSyncPhpUrl = sails.config.SkuSyncPhpUrl;
            const gameId = req.body.GameId;
            const marketPlaceId = req.body.MarketPlaceId;
            let gameServicePermision = await checkServiceOfGame(req, gameId);
            let selectResp = [];
            if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"syncAllSkuOnMarketPlace",
                        "marketplaceid": marketPlaceId
                    }
                }
                var response = await socketRequestData(req,reqObj,websocket,gameId,'webstore');      
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        selectResp = [...response.msg]
                    }
                }
            }
            if('undefined' == typeof selectResp || selectResp.length == 0 || selectResp[0].IsValidMarketPlace == 0){
                req.session.msg = 'MarketPlace not mapped to game';
                return res.status(200).send(false);
            }
            let marketPlaceName = (selectResp[0].MarketPlaceName).toLowerCase();
            if(marketPlaceName == 'apple'){
                SkuSyncPhpUrl += 'appledownload='+gameId;
            }else if(marketPlaceName == 'google'){
                SkuSyncPhpUrl += 'googledownload='+gameId;
            }else{
                req.session.msg = 'Invalid MarketPlace selected';
                return res.status(200).send(false);
            }
            let body= await UtilService.getRequest(SkuSyncPhpUrl,{});
            return res.status(200).send(body);
            // body = JSON.parse(body);
            // if(typeof body.status != 'undefined' && body.status == 1){
            //     req.session.msg='MarketPlace SKUs sync successful';
            //     return res.status(200).send(true);
            // }else{
            //     req.session.msg='Cannot Sync all SKUs on MarketPlace';
            //     return res.status(200).send(false);
            // }
        } catch (error) {
            console.error({error: error,service: 'WebStoresController.syncAllSkuOnMarketPlace',line: 2714,error_at: Moment.getTimeForLogs()});
            req.session.msg = 'Something went wrong, Please try again later';
            return res.status(200).send(false);
        }
    },
    updatetag: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                let TagId = req.param('TagId');
                let actionType = req.param('actionType');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/updatetag?game_id=' + game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/updatetag' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let tagresult = [], result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjName = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagName"
                        }
                    }
                    var responseName = await socketRequestData(req,reqObjName,websocket,game_id,'webstore');  
                    if(typeof responseName == 'object'){
                        let status=responseName.Status;
                        if(status==1){
                            result = [...responseName.msg]
                        }
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagIdData",
                            "tagid":TagId
                        }
                    }
                    var responseTag =  await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');  
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            tagresult = [...responseTag.msg]
                        }
                    }
                }
                let AllTagNames = [];
                if(result.length > 0) {
                    result.forEach(item => { AllTagNames.push(item.TagName) });
                }    
                res.view({ data: AllTagNames, game_id_sub_header: game_id, tagresult: tagresult[0],actionType:actionType,TagId:TagId });
            } else {
                let TagId = req.body.TagId;
                let TagName = req.body.TagName;
                let Description = req.body.Description;
                let GameId = req.body.GameId;
                let actionType = req.body.actionType;
                let OriginalTagName = req.body.OriginalTagName;
                let enableTagName = req.body.enableTagName;
                 let editAllowed = req.body.TagImageEdit; 
                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/updatetag' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }

                let Status = req.body.Status;
                let reqObj = {
                    "action": actionType,
                    "Status": Status,
                };

                if (actionType === 'editSkuTag') {
                    reqObj["SkuTagId"] = TagId;
                    reqObj["SkuTagDescription"] = Description;
                    reqObj["SkuTagName"] = TagName; 

                    if (enableTagName === undefined) {
                        reqObj['SkuTagName'] = TagName;
                    }
                } 
                else if (actionType === 'createTag') {
                    reqObj["TagName"] = TagName;
                    reqObj["Description"] = Description;
                }
                let existingImageURL = req.body.existingTagImage;                
               
                if (editAllowed) {
                    let TagImageFile = req.file('TagImage');
                    let promises = [];
                    promises.push(new Promise((resolve, reject) => {
                        TagImageFile.upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles) {
                            if (err || !uploadedFiles.length) {
                                return reject(`SERVER ERROR=> TagImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                            }
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            if (req.body.enableTagName === undefined) {
                                const Key = `sku/${GameId}/TagImage/${OriginalTagName + '_updated_' + timestamp}.${accept}`;
                            }
                            const Key = `sku/${GameId}/TagImage/${TagName + '_updated_' + timestamp}.${accept}`;
                            let { SkuImageS3Bucket: Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
            
                            if (typeof sails.config.AwsAccountCredentialForGame !== 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] !== 'undefined') {
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if (typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] !== 'undefined') {
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"];
                                }
                            }
            
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });
            
                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({ Bucket, Key, Body, ContentType: imageContentType }, async (err, data) => {
                                if (err) {
                                    return reject(`Error uploading to S3: ${err.message}`);
                                }
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
            
                                if (actionType === 'editSkuTag') {
                                    reqObj["SkuTagImageUrl"] = url;
                                } else if (actionType === 'createTag') {
                                    reqObj["TagImage"] = url;
                                }
                                resolve();
                            });
                        });
                    }));
                    Promise.all(promises)
                        .then(async () => {
                            var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');  
                            if (typeof response === 'object') {
                                if (response.Status === 1 && (actionType === 'createTag')  ) {
                                     req.session.msg = 'Tag creation successful';
                                }else if(response.Status === 0)
                                {
                                    req.session.msg = (actionType === 'createTag') ?'Tag creation successful' : 'Tag Edit successful';
                                }
                                 else {
                                    req.session.msg = response.msg;
                                }
                                return res.redirect('/webstores/tag?game_id=' + GameId);
                            }
                            req.session.msg = 'Something went wrong.';
                            return res.redirect('/webstores/tag?game_id=' + GameId);
                        }).catch((error) => {
                            console.error({
                                error: error,
                                service: 'WebStoreController.updatetag',
                                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                                error_at: Moment.getTimeForLogs()
                            });
                            req.session.msg = 'Something went wrong.';
                            return res.redirect('/webstores/tag?game_id=' + GameId);
                        });
                } else {
                    if (!existingImageURL) {
                        if (actionType === 'editSkuTag') {
                            reqObj["SkuTagImageUrl"] = ''; 
                        }
                    } else {
                        if (actionType === 'editSkuTag') {
                            reqObj["SkuTagImageUrl"] = existingImageURL;
                        } else if (actionType === 'createTag') {
                            reqObj["TagImage"] = existingImageURL;
                        }
                    }
            
                    try {
                        var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                        if (typeof response === 'object') {
                            if (response.Status === 1 && (actionType === 'createTag')  ) {
                                 req.session.msg = 'Tag creation successful';
                            }else if(response.Status === 0 )
                            {
                                req.session.msg = (actionType === 'createTag') ?'Tag creation successful' : 'Tag Edit successful';
                            }
                             else {
                                req.session.msg = response.msg;
                            }
                            return res.redirect('/webstores/tag?game_id=' + GameId);
                        }
                        req.session.msg = 'Something went wrong.';
                        return res.redirect('/webstores/tag?game_id=' + GameId);
                    } catch (error) {
                        console.error({
                            error: error,
                            service: 'WebStoreController.updatetag',
                            line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                            error_at: Moment.getTimeForLogs()
                        });
                        req.session.msg = 'Error processing request.';
                        return res.redirect('/webstores/tag?game_id=' + GameId);
                    }
                }
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.updateTag',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    editDuplicateBenefitType: async function(req , res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let SkuBenefitId = req.param('SkuBenefitId');
                let actionType = req.param('actionType');
                let game_id = req.param('game_id');

                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/benefittype?game_id='+game_id);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let GetImageResult = [], benefitTypeName = [], result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj1 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitTypeIdData",
                            "skubenefitid":SkuBenefitId
                        }
                    }
                    var response1 = await socketRequestData(req,reqObj1,websocket,game_id,'webstore');    
                    if(typeof response1 == 'object'){
                        let status=response1.Status;
                        if(status==1){
                            GetImageResult = [...response1.msg]
                        }
                    }

                    let reqObj2 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitName"
                        }
                    }
                    var response2 = await socketRequestData(req,reqObj2,websocket,game_id,'webstore');   
                    if(typeof response2 == 'object'){
                        let status=response2.Status;
                        if(status==1){
                            benefitTypeName = [...response2.msg]
                        }
                    }

                    let reqObj3 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitTypeforStatus",
                            "skubenefitid": SkuBenefitId
                        }
                    }
                    var response3 = await socketRequestData(req,reqObj3,websocket,game_id,'webstore');   
                    if(typeof response3 == 'object'){
                        let status=response3.Status;
                        if(status==1){
                            result = [...response3.msg]
                        }
                    }
                }
                let AllBenefitNames = [];
                if(GetImageResult.length > 0){
                    GetImageResult.forEach(item=>{AllBenefitNames.push({'Name':item.SkuBenefitImageName, 'Image':item.SkuBenefitImageLink, 'Id':item.SkuBenefitImageId})});
                }    
                let benefitTypeNames = [];
                if(benefitTypeName.length > 0){
                    benefitTypeName.forEach(item => {benefitTypeNames.push(item.SkuBenefitName)});
                }
                res.view({data : result[0], game_id_sub_header : game_id, benefitTypeNames :benefitTypeNames, actionType : actionType, SkuBenefitId : SkuBenefitId, imageData : AllBenefitNames});
            } else if (req.method == 'POST') {
                let GameId = req.body.GameId;
                let SkuBenefitId = req.body.SkuBenefitId;
                let orgName = req.body.originalName;
                let Description = req.body.SkuBenefitDescription;
                let Status = req.body.Status;
                let actionType = req.body.actionType;
                let SkuBenefitName = req.body.SkuBenefitName;
                
                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                } 
                else if (typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/benefittype?game_id=' + GameId);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }

                let reqObj = {
                    "action": actionType,
                    "Status": Status,
                };

                let reqObjI = {};
                
                if (actionType == 'editSkuBenefitType') {
                    reqObj['SkuBenefitId'] = SkuBenefitId;
                    reqObj['SkuBenefitName'] = SkuBenefitName;
                    reqObj["SkuBenefitDescription"] = Description;
                    
                    if (SkuBenefitName === undefined) {
                        reqObj['SkuBenefitName'] = orgName;
                    }
                }
                else if (actionType == 'createBenefitType') {
                    reqObj['BenefitTypeName'] = SkuBenefitName;
                    reqObj['Description'] = Description;
                    reqObj['OldSkuBenefitId'] = SkuBenefitId;
                }
                try {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');   
                    if (typeof response === 'object') {
                        let status = response.Status;
                        if (status == 1) {
                            req.session.msg = (actionType === 'createBenefitType') ? 'SkuBenefitType created successfully' : 'SkuBenefitType edited successfully';
                        } else {
                            req.session.msg = response.msg;
                        }
                    } else {
                        req.session.msg = 'Unexpected response format.';
                    }
                } catch (error) {
                    console.error({
                        error: error,
                        service: 'WebStoreController.editDuplicateBenefitType',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg = 'Something went wrong.';
                }
                return res.redirect('/webstores/benefittype?game_id='+GameId);
            }
        }  catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.editDuplicateBenefitType',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    updateskus: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let GameId = req.param('game_id');
                let SkuId = req.param('SkuId');
                let actionType =req.param('actionType')
                if (!GameId || !SkuId) {
                    req.session.msg = 'Bad Request: Missing GameId or SkuId';
                    return res.redirect('/webstores/sku?game_id='+GameId);
                }
                let redirectUrl = await checkServiceOfGame(req,GameId,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, GameId);
                let skumetaresult = [], skumultiresult = [], benefitImageDatafordata = [], topicnamedata = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj1 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuIdData",
                            "skuid":SkuId
                        }
                    }
                    var response1 = await socketRequestData(req,reqObj1,websocket,GameId,'webstore'); 
                    if(typeof response1 == 'object'){
                        let status=response1.Status;
                        if(status==1){
                            skumetaresult = [...response1.msg]
                        }
                    }

                    let reqObj2 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMulti",
                            "skuid":SkuId
                        }
                    }
                    var response2 = await socketRequestData(req,reqObj2,websocket,GameId,'webstore');  
                    if(typeof response2 == 'object'){
                        let status=response2.Status;
                        if(status==1){
                            skumultiresult = [...response2.msg]
                        }
                    }

                    let reqObj3 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitImageData"
                        }
                    }
                    var response3 = await socketRequestData(req,reqObj3,websocket,GameId,'webstore');  
                    if(typeof response3 == 'object'){
                        let status=response3.Status;
                        if(status==1){
                            benefitImageDatafordata = [...response3.msg]
                        }
                    }

                    let reqObj4 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTopicName"
                        }
                    }
                    var response4 = await socketRequestData(req,reqObj4,websocket,GameId,'webstore');    
                    if(typeof response4 == 'object'){
                        let status=response4.Status;
                        if(status==1){
                            topicnamedata = [...response4.msg]
                        }
                    }
                }
                let resultImageData = {};
                benefitImageDatafordata.forEach(item => {
                if (!resultImageData[item.SkuBenefitName]) {
                    resultImageData[item.SkuBenefitName] = [];
                }
                resultImageData[item.SkuBenefitName].push({'Link':item.SkuBenefitImageLink,'Name':item.SkuBenefitImageName});
                });
                let benefitImageData = skumetaresult.map(row => JSON.parse(row.SkuMeta));
                let title = skumetaresult.map(row => row.title);
                let description = skumetaresult.map(row => row.SkuDescription);
                let skuData = skumultiresult[0]; 
                res.view({ 
                    game_id_sub_header:GameId, 
                    benefitImageData: benefitImageData[0], 
                    skuData: skuData ,
                    SkuId:SkuId,
                    resultImageData:resultImageData,
                    actionType:actionType, 
                    IsViewerOnly: isViewerOnly,
                    topicnamedata:topicnamedata,
                    title:title,
                    description:description
                });
            } else{
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/sku' + (('undefined' != typeof (req.body.GameId)) ? ('?game_id='+(req.body.GameId)) : ''));
                }
                let AdminID = req.session.adminUserId;
                let actionType = req.body.actionType;
                let SkuId=req.body.SkuId;

                let reqObj = {};
               

                reqObj["action"] = actionType;
                
                if (actionType === 'createSku') {
                    reqObj["SkuData"] = {
                        "SkuStatus":1,
                        "RecAddBy" : AdminID,
                        "GameId":req.body.GameId,
                        "SkuMultiPurchase":req.body.SkuMultiPurchase,
                        "SkuBenefitDays":req.body.SkuBenefitDays,
                        "RecAddSource":"Panel",
                        "SkuStartDate":(req.body.SkuStartDate!='')?(req.body.SkuStartDate)+" 00:00:00":null,
                        "SkuTitle":req.body.SkuRefLocalizationTitle,
                        "SkuDescription":req.body.SkuRefLocalizationDescription,
                        "SkuMeta":{
                            "skuBaseBenefit":{
                                "currentBenefit":{
                                    "amount":(req.body.baseCurrentAmount).replace(/,/g,''),
                                    "currency":req.body.baseCurrentUrl,
                                    "currencyName":req.body.baseCurrentName
                                },
                                "oldBenefit":{
                                    "amount":(typeof req.body.baseOldAmount != 'undefined') ? (req.body.baseOldAmount).replace(/,/g,'') : '',
                                    "currency":(typeof req.body.baseOldUrl != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldUrl : '',
                                    "currencyName":(typeof req.body.baseOldName != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldName : ''
                                }
                            }
                        }
                    }
                } 
                if (actionType === 'updateSku') {
                    reqObj["SkuId"] = SkuId;
                    reqObj["AdminID"] = AdminID;
                    reqObj["SkuMultiPurchase"] = req.body.SkuMultiPurchase;
                    reqObj["SkuBenefitDays"] = req.body.SkuBenefitDays;
                    reqObj["RecLuSource"] = "Panel";
                    reqObj["SkuTitle"] = req.body.SkuRefLocalizationTitle;
                    reqObj["SkuDescription"] = req.body.SkuRefLocalizationDescription;
                    reqObj["SkuMeta"] = {
                        "skuBaseBenefit":{
                            "currentBenefit":{
                                "amount":(req.body.baseCurrentAmount).replace(/,/g,''),
                                "currency":req.body.baseCurrentUrl,
                                "currencyName":req.body.baseCurrentName
                            },
                            "oldBenefit":{
                                "amount":(typeof req.body.baseOldAmount != 'undefined') ? (req.body.baseOldAmount).replace(/,/g,'') : '',
                                "currency":(typeof req.body.baseOldUrl != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldUrl : '',
                                "currencyName":(typeof req.body.baseOldName != 'undefined' && typeof req.body.baseOldAmount != 'undefined' && (req.body.baseOldAmount).replace(/,/g,'')>0) ? req.body.baseOldName : ''
                            }
                        }
                    };
                }
                    if (actionType === 'createSku') {
                        let count = req.body.count; 
                        if (count > 0) {
                            for (let i = 1; i <= count; i++) {
                                reqObj.SkuData.SkuMeta[`skuExtraBenefit${i}`] = {
                                    currentBenefit: {
                                        amount: (req.body[`extra${i}CurrentAmount`]).replace(/,/g,'') , 
                                        currency: req.body[`extra${i}CurrentUrl`] ,
                                        currencyName: req.body[`extra${i}CurrentName`] 
                                    },
                                    oldBenefit: {
                                        amount: (typeof req.body[`extra${i}OldAmount`] !== 'undefined') ? (req.body[`extra${i}OldAmount`]).replace(/,/g,'') : '', 
                                        currency: (typeof req.body[`extra${i}OldUrl`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldUrl`] : '', 
                                        currencyName: (typeof req.body[`extra${i}OldName`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldName`] : ''
                                    }
                                };
                            }
                        }
                    }
                else if(actionType === 'updateSku')
                {
                    let count = req.body.count; 
                    if (count > 0) {
                        for (let i = 1; i <= count; i++) {
                            reqObj["SkuMeta"][`skuExtraBenefit${i}`] = {
                                currentBenefit: {
                                    amount: (req.body[`extra${i}CurrentAmount`]).replace(/,/g,'') , 
                                    currency: req.body[`extra${i}CurrentUrl`] ,
                                    currencyName: req.body[`extra${i}CurrentName`] 
                                },
                                oldBenefit: {
                                    amount: (typeof req.body[`extra${i}OldAmount`] !== 'undefined') ? (req.body[`extra${i}OldAmount`]).replace(/,/g,'') : '', 
                                    currency: (typeof req.body[`extra${i}OldUrl`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldUrl`] : '', 
                                    currencyName: (typeof req.body[`extra${i}OldName`] !== 'undefined' && req.body[`extra${i}OldAmount`] !== 'undefined' && (req.body[`extra${i}OldAmount`]).replace(/,/g,'')>0) ? req.body[`extra${i}OldName`] : ''
                                }
                            };
                        }
                    }
                }
                let GameId=req.body.GameId;
                var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        req.session.msg = (actionType === 'createSku') ? 'Sku creation successful' : 'Sku edit successful';
                        return res.redirect('/webstores/sku?game_id=' + GameId);
                    }else{
                        req.session.msg="Something Went Wrong";
                        return res.redirect('/webstores/sku?game_id=' + GameId);
                    }
                }
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.updatesku',
                line: 3350,
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    editDuplicatePromoImage: async function(req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                let PromoImageId = req.param('PromoImageId');
                let actionType = req.param('actionType');

                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/promoimage?game_id='+game_id);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let getPromoImage = [], result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObjImage = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageIdData",
                            "promoimageid":PromoImageId
                        }
                    }
                    var responseImage =await socketRequestData(req,reqObjImage,websocket,game_id,'webstore'); 
                    if(typeof responseImage == 'object'){
                        let status=responseImage.Status;
                        if(status==1){
                            getPromoImage = [...responseImage.msg]
                        }
                    }

                    let reqObjName = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageName"
                        }
                    }
                    var responseName = await socketRequestData(req,reqObjName,websocket,game_id,'webstore'); 
                    if(typeof responseName == 'object'){
                        let status=responseName.Status;
                        if(status==1){
                            result = [...responseName.msg]
                        }
                    }
                }
                let AllPromoImageNames = [];
                if(result.length > 0){
                    result.forEach(item=>{AllPromoImageNames.push(item.PromoImageName)});
                }
                res.view({imageNames : AllPromoImageNames, game_id_sub_header : game_id, PromoImageId : PromoImageId , data : getPromoImage[0], actionType : actionType});
            }
            else if (req.method == 'POST') {
                let GameId = req.body.GameId;
                let PromoImageId = req.body.PromoImageId;
                let PromoImageName = req.body.PromoImageName;
                let Description = req.body.Description;
                let Status = req.body.Status;
                let orgName = req.body.originalName;
                let actionType = req.body.actionType;
                let checkbox = req.body.Checkbox;
                let url = req.body.url;

                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                } 
                else if (typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/promoimage?game_id=' + GameId);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/promoimage' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }

                let reqObj = {
                    "action" : actionType,
                    "Status" : Status,
                    "PromoImageLink" : url,
                }
                if (actionType == 'editSkuPromoImage') {
                    reqObj['PromoImageId'] = PromoImageId;
                    reqObj['PromoImageName'] = PromoImageName;
                    if (PromoImageName === undefined) {
                        reqObj['PromoImageName'] = orgName;
                    }
                    reqObj["PromoImageDescription"]=Description;
                }
                else if (actionType == 'createPromoImage') {
                    reqObj['PromoImageName'] = PromoImageName;
                    reqObj['Description'] = Description;
                }
                let promises = [];
                if (checkbox == 'on') {
                    promises.push(new Promise((resolve,reject)=>{
                        req.file('PromoImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                            if (err || !uploadedFiles.length)
                                return reject(`SERVER ERROR=> PromoImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            if (PromoImageName === undefined)
                                PromoImageName = orgName;
                            let PromoImageNameUrl = PromoImageName.replace(/\s/g,'');
                            PromoImageNameUrl = (actionType == 'editSkuPromoImage') ? PromoImageNameUrl+'_updated': PromoImageNameUrl;
                            const Key = `sku/${GameId}/PromoImage/${PromoImageNameUrl+'_'+timestamp}.${accept}`;
                            let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                            if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                                }
                            }
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });

                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                                if (err) 
                                    return reject(`Error uploading to S3: ${err.message}`);
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                                reqObj["PromoImageLink"]=url;
                                resolve();
                            })
                        })
                    }));
                }
                Promise.all(promises)
                .then(async () => {
                    var response = await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                    if (typeof response == 'object') {
                        let status = response.Status;
                        if (status == 1) {
                            req.session.msg = (actionType === 'createPromoImage') ? 'Sku Promo Image created successfully' : 'Sku Promo Image edited successfully';
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        } else {
                            req.session.msg = response.msg;
                            return res.redirect('/webstores/promoImage?game_id='+GameId);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                }).catch((error) => {
                    console.error({
                        error: error,
                        service: 'WebStoreController.editDuplicatePromoImage',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect('/webstores/promoImage?game_id='+GameId);
                })   
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.editDuplicatePromoImage',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    skuBenefitTypeImages: async function(req, res) {
        try{
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                let SkuBenefitId = req.param('SkuBenefitId');
                let SkuBenefitName=req.param('SkuBenefitName');

                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/benefittype?game_id='+game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let GetImageResult = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitTypeImagesIdData",
                            "skubenefitid":SkuBenefitId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');     
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            GetImageResult = [...response.msg]
                        }
                    }
                }
                let AllBenefitNames = [];
                if(GetImageResult.length > 0){
                    GetImageResult.forEach(item=>{AllBenefitNames.push({'Name':item.SkuBenefitImageName, 'Image':item.SkuBenefitImageLink, 'Id':item.SkuBenefitImageId, 'Description':item.SkuBenefitDescription})});
                }
                res.view({game_id_sub_header : game_id, SkuBenefitId : SkuBenefitId, imageData : AllBenefitNames, SkuBenefitName : SkuBenefitName, IsViewerOnly: isViewerOnly});
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.skuBenefitTypeImages',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    editBenefitTypeImage : async function(req, res) { 
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                let SkuBenefitImageId = req.param('SkuBenefitImageId');
                let SkuBenefitId = req.param('SkuBenefitId');
                let SkuBenefitName = req.param('SkuBenefitName');

                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                }
                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect(`/webstores/skuBenefitTypeImages?game_id=${game_id}&SkuBenefitId=${SkuBenefitId}`);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let GetImageResult = [], GetImageNamesResult = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj1 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBenefitTypeImagesIdDataForEdit",
                            "skubenefitimageid":SkuBenefitImageId
                        }
                    }
                    var response1 =  await socketRequestData(req,reqObj1,websocket,game_id,'webstore'); 
                    if(typeof response1 == 'object'){
                        let status=response1.Status;
                        if(status==1){
                            GetImageResult = [...response1.msg]
                        }
                    }

                    let reqObj2 = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuBenefitImageName",
                            "skubenefitid":SkuBenefitId
                        }
                    }
                    var response2 =  await socketRequestData(req,reqObj2,websocket,game_id,'webstore'); 
                    if(typeof response2 == 'object'){
                        let status=response2.Status;
                        if(status==1){
                            GetImageNamesResult = [...response2.msg]
                        }
                    }
                }
                let AllBenefitNames = [];
                if(GetImageResult.length > 0){
                    GetImageResult.forEach(item=>{AllBenefitNames.push({'Name':item.SkuBenefitImageName, 'Image':item.SkuBenefitImageLink, 'Status' : item.SkuBenefitImageStatus, 'Description' : item.SkuBenefitDescription})});
                }
                let AllBenefitImageNames = [];
                if(GetImageNamesResult.length > 0){
                    GetImageNamesResult.forEach(item=>{AllBenefitImageNames.push(item.SkuBenefitImageName)});
                }    
                res.view({game_id_sub_header : game_id, SkuBenefitImageId : SkuBenefitImageId, data : AllBenefitNames[0], imageNames : AllBenefitImageNames, SkuBenefitId : SkuBenefitId, SkuBenefitName : SkuBenefitName});
            }
            else if (req.method == 'POST') {
                let GameId = req.body.GameId;
                let SkuBenefitId = req.body.SkuBenefitId;
                let SkuBenefitImageId = req.body.SkuBenefitImageId;
                let SkuBenefitImageName = req.body.SkuBenefitImageName;
                let orgName = req.body.originalName;
                let Description = req.body.Description;
                let Status = req.body.Status;
                let checkbox = req.body.Checkbox;
                let url = req.body.url;
                let SkuBenefitName = req.body.SkuBenefitName;

                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                } 
                else if (typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/benefittype?game_id=' + GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/benefittype' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let promises = [];
                if (checkbox == 'on') {
                    promises.push(new Promise((resolve,reject)=>{
                        req.file('BenefitTypeImage').upload({ dirname: os.tmpdir() }, async function (err, uploadedFiles){
                            if (err || !uploadedFiles.length)
                                return reject(`SERVER ERROR=> BenefitTypeImage >>> Error: ${err ? err.message : 'No files uploaded'}`);
                            const file = uploadedFiles[0];
                            const fs = require('fs');
                            const AWS = require('aws-sdk');
                            const Body = fs.readFileSync(file.fd);
                            const timestamp = new Date().getTime();
                            let accept = file.fd.split(".").pop();
                            if (SkuBenefitImageName === undefined)
                                SkuBenefitImageName = orgName;
                            const Key = `sku/${GameId}/SkuBenefitImage/${SkuBenefitImageName+'_updated_'+timestamp}.${accept}`;
                            let { SkuImageS3Bucket:Bucket, awsAccessId, awsSecretIdKey, awsRegion } = sails.config;
                            if(typeof sails.config.AwsAccountCredentialForGame != 'undefined' && typeof sails.config.AwsAccountCredentialForGame[GameId] != 'undefined'){
                                awsAccessId = sails.config.AwsAccountCredentialForGame[GameId].awsAccessId;
                                awsSecretIdKey = sails.config.AwsAccountCredentialForGame[GameId].awsSecretIdKey;
                                awsRegion = sails.config.AwsAccountCredentialForGame[GameId].awsRegion;
                                if(typeof sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"] != 'undefined'){
                                    Bucket = sails.config.AwsAccountCredentialForGame[GameId]["SkuImageS3Bucket"]
                                }
                            }
                            AWS.config.update({
                                accessKeyId: awsAccessId,
                                secretAccessKey: awsSecretIdKey,
                                region: awsRegion
                            });

                            let imageType = accept.toLowerCase();
                            let imageContentType = 'image/';
                            if(imageType == 'jpeg' || imageType == 'jpg'){
                                imageContentType += 'jpeg';
                            }else if(imageType == 'tiff' || imageType == 'tif'){
                                imageContentType += 'tiff';
                            }else if(imageType == 'ico'){
                                imageContentType += 'x-icon';
                            }else if(imageType == 'svg'){
                                imageContentType += 'svg+xml';
                            }else{
                                imageContentType += imageType;
                            }

                            (new AWS.S3()).upload({Bucket, Key, Body, ContentType: imageContentType}, async (err, data) => {
                                if (err) 
                                    return reject(`Error uploading to S3: ${err.message}`);
                                url = 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId] && 'undefined' != typeof sails.config.AwsAccountCredentialForGame[GameId].isCdnActive && sails.config.AwsAccountCredentialForGame[GameId].isCdnActive?'https://'+Bucket+"/"+Key:data.Location;
                                reqObj["SkuBenefitImageLink"]=url;
                                resolve();
                            })
                        })
                    }));
                }
                let reqObj = {
                    "action" : "editSkuBenefitTypeImage",
                    "SkuBenefitImageId" : SkuBenefitImageId,
                    "Status" : Status,
                    "SkuBenefitImageLink" : url,
                    "SkuBenefitDescription" : Description
                }

                if (SkuBenefitImageName != undefined) {
                    if(SkuBenefitImageName != orgName)
                        reqObj['SkuBenefitImageName'] = SkuBenefitImageName;
                }

                Promise.all(promises)
                .then(async () => {
                    var response =  await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                    if (typeof response == 'object') {
                        let status = response.Status;
                        if (status == 1) {
                            req.session.msg = 'Edited successfully';
                            return res.redirect(`/webstores/skuBenefitTypeImages?game_id=${GameId}&SkuBenefitName=${SkuBenefitName}&SkuBenefitId=${SkuBenefitId}`);
                        } else {
                            req.session.msg = response.msg;
                            return res.redirect(`/webstores/skuBenefitTypeImages?game_id=${GameId}&SkuBenefitName=${SkuBenefitName}&SkuBenefitId=${SkuBenefitId}`);
                        }
                    }
                    req.session.msg='Something went wrong.'
                    return res.redirect(`/webstores/skuBenefitTypeImages?game_id=${GameId}&SkuBenefitName=${SkuBenefitName}&SkuBenefitId=${SkuBenefitId}`);
                }).catch((error) => {
                    console.error({
                        error: error,
                        service: 'WebStoreController.editBenefitTypeImage',
                        line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                        error_at: Moment.getTimeForLogs()
                    });
                    req.session.msg='Something went wrong.'
                    return res.redirect(`/webstores/skuBenefitTypeImages?game_id=${GameId}&SkuBenefitName=${SkuBenefitName}&SkuBenefitId=${SkuBenefitId}`);
                })
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.editBenefitTypeImages',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            res.redirect('/webstores/view');
        }
    },
    addSkuAssets: async function (req, res) {
        try {
            let isViewerOnly = isViewOnly(req);
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/sku?game_id=' + game_id);
                }

                if (!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined) {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id=' + game_id);
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let skuId = req.param('sku_id');
                if ('undefined' == typeof skuId || !(/^\d+$/).test(skuId)) {
                    req.session.msg = 'Something went wrong, please try again';
                    return res.redirect('/webstores/sku?game_id=' + game_id);
                }
                skuId = Number(skuId);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let selectResp = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"addSkuAssets",
                            "skuid": skuId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            selectResp = [...response.msg]
                        }
                    }
                }
                if ('undefined' == typeof selectResp || selectResp.length == 0 || Number(selectResp[0].IsValidSku) == 0) {
                    req.session.msg = 'Sku not found for this game';
                    return res.redirect('/webstores/sku?game_id=' + game_id);
                }
                // if (!isViewerOnly && Number(selectResp[0].SkuStatus) == 1) {
                //     req.session.msg = 'Assets cannot be added to active Sku';
                //     return res.redirect('/webstores/sku?game_id=' + game_id);
                // }
                let skuAssets = JSON.parse(selectResp[0].SkuAssets);
                return res.view({ game_id_sub_header: game_id, sku_id: skuId, sku_assets: skuAssets, IsViewerOnly: isViewerOnly });
            } else if (req.method == 'POST') {
                let GameId = req.body.GameId;
                if (typeof GameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    GameId = req.session.AdminCurrentGame;
                }
                else if (typeof req.session.AdminCurrentGame != 'undefined' && GameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/sku?game_id=' + GameId);
                }

                let skuId = req.body.SkuId;
                if ('undefined' == typeof skuId) {
                    req.session.msg = 'Something went wrong, please try again';
                    return res.redirect('/webstores/sku?game_id=' + GameId);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/sku' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }

                let finalSkuAssets = {};
                let totalKeys = Number(req.body.KeysLength) || 0;
                for (let i = 0; i < totalKeys; i++) {
                    if ('undefined' == typeof req.body['Key' + (i + 1)] || 'undefined' == typeof req.body['Value' + (i + 1)]) {
                        req.session.msg = 'Game is not matching admin selected game.';
                        return res.redirect('/webstores/addskuassets?sku_id=' + skuId + '&game_id=' + GameId);
                    }
                    finalSkuAssets[req.body['Key' + (i + 1)]] = req.body['Value' + (i + 1)];
                }

                let reqObj = {
                    action: "addSkuAssets",
                    SkuId: skuId,
                    SkuAssetsMeta: finalSkuAssets
                }
                let response = await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                if (typeof response == 'object') {
                    let status = response.Status;
                    if (status == 1) {
                        req.session.msg = response.msg;
                        return res.status(200).send(true);
                    } else {
                        req.session.msg = response.msg;
                        return res.status(200).send(false);
                    }
                }
                req.session.msg = 'Something went wrong.'
                return res.status(200).send(false);
            } else {
                return res.redirect('/webstores/view');
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.addSkuAssets',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    validateUrl: async function (req, res){
        try{
            if(req.method == 'POST'){
                if('undefined' == typeof req.body.UrlList || typeof req.body.UrlList != 'object' || !Array.isArray(req.body.UrlList)){
                    return res.status(200).send(false);
                }
                let urlList = req.body.UrlList;
                for(let i in urlList){
                    if(urlList[i].startsWith('http')){
                        try{
                            new URL(urlList[i]);
                            if (!(await checkUrlStatus(urlList[i]))) {
                                return res.status(200).send(false);
                            }
                        }catch(e){
                            return res.status(200).send(false);
                        }
                    }
                }
                return res.status(200).send(true);
            }else{
                return res.status(200).send(false);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.validateUrl',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    viewUserDetail: async function (req,res){
        try {
            if (req.method == 'GET'){
                let game_id=req.param('game_id');
                let gocid = req.param('gocid') ? req.param('gocid') : ''; 
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let GameServiceAllowed  = await checkServiceOfGame(req,game_id);
                res.view({game_id_sub_header:game_id, GameServiceAllowed:GameServiceAllowed , gocid:gocid});
            } else {
                let game_id = req.body.GameId;
                let GOCID = req.body.GOCID;
                let TransactionId = req.body.TransactionId;
                let guestid = req.body.guestid;
                if(guestid != 'false'){
                    let selectQuery = `SELECT gpm.GOCID FROM game_player_master gpm JOIN guest_users gu ON gpm.GUESTID = gu.GUESTID AND gpm.GameID = gu.GAMEID WHERE gu.guest_id = '${guestid}' AND gpm.GameID = '${game_id}'`;
                    let selectResp = (await sails.getDatastore("slave").sendNativeQuery(selectQuery)).rows;
                    if('undefined' == typeof selectResp || selectResp.length == 0 || selectResp[0].GOCID == null){
                        req.session.msg = 'GuestID not found for this game';
                        return res.status(200).send([]);
                    }
                    GOCID = selectResp[0].GOCID;
                }
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"viewUserDetail"
                    }
                }
                let getDetailsQuery;
                if(GOCID != 'false'){
                    getDetailsQuery += ` (gpm.GOCID = '${GOCID}')`
                    if(TransactionId != 'false'){
                        getDetailsQuery += ` AND`;
                    }
                    reqObj["parameters"]["gocid"] = GOCID;
                }
                if(TransactionId != 'false'){
                    reqObj["parameters"]["transactionid"] = TransactionId;
                    getDetailsQuery += ` usp.TransactionId = '${TransactionId}'`;
                }
                getDetailsQuery += ` AND gpm.GameID = '${game_id}'`;

                let selectResp = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore'); 
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            selectResp = [...response.msg]
                        }
                    }
                }
                const groupedResult = selectResp.reduce((acc, currentItem) => {
                    let existingGroup = acc.find(group => group.Store === currentItem.StoreRefId);
                    if (existingGroup) {
                        const childIndex = `${existingGroup.Index}.${existingGroup.ChildNodes.length + 1}`;
                        existingGroup.ChildNodes.push({ ...currentItem, Index: childIndex, ParentIndex: acc.length });
                    } else {
                        const mainObjIndex = acc.length + 1;
                        acc.push({
                            Store: currentItem.StoreRefId,
                            Index: mainObjIndex.toString(),
                            ChildNodes: [{ ...currentItem, Index: `${mainObjIndex}.1`, ParentIndex:mainObjIndex }]
                        });
                    }
                    return acc;
                }, []);
                if(groupedResult.length > 0){
                    return res.status(200).send(groupedResult);
                }else{
                    return res.status(200).send([]);
                }
            }
        } catch (error) {
            return res.status(500).send(false);
        }
    },
    getSkuDetails: async function(req,res){
        try {
            if(req.method == 'GET'){
                let TransactionId = req.param('TransactionId');
                let type = req.param('type');
                let object = {};
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(true);
                }
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let result = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuDetails",
                            "transactionid": TransactionId,
                            "type": type
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                if(result.length > 0){
                    if(type == 'asset')
                        object = result[0].Asset;
                    else if(type == 'meta')
                        object = result[0].Meta;
                }
                return res.status(200).send(object);
            }
        } catch (error) {
            return res.status(500).send(false);
        }
    },
    getName: async function(req, res) {
        try {
          if (req.method === 'GET') {
            let RecAddBy = req.param('RecAddBy');
            let RecLuBy = req.param('RecLuBy');
            let Type = req.param('Type');
      
            let combinedQuery = '';
            
            if (Type === 'sku' || Type === 'store') {
              combinedQuery = `
                SELECT username, 'add' as type FROM acl_admins WHERE admin_id = ${RecAddBy}
                UNION ALL
                SELECT username, 'lu' as type FROM acl_admins WHERE admin_id = ${RecLuBy}
              `;
      
              let result = await sails.getDatastore("slave").sendNativeQuery(combinedQuery, []);
              let addData = result.rows.find(row => row.type === 'add') || {};
              let luData = result.rows.find(row => row.type === 'lu') || {};
      
              return res.json({
                RecAddBy: addData.username || 'N/A',
                RecLuBy: luData.username || 'N/A'
              });
            } else {
              return res.json({ error: 'Invalid type' });
            }
          }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.getName',
                line: 3600,
                error_at: Moment.getTimeForLogs()
            });
            req.session.msg = 'Something went wrong.'
            res.redirect('/webstores/view');
        }
    },
    duplicateStorePricing: async function(req,res){
        try {
          let isViewerOnly = isViewOnly(req);
          if(req.method == 'GET'){
            let game_id=req.param('game_id');
            let redirectUrl = await checkServiceOfGame(req,game_id,1);
            if(redirectUrl!=false) return res.redirect(redirectUrl);

            if(typeof req.param('StoreId') != 'undefined'){
                let publish = false;
                let containsMapping = false;
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let StoreId=req.param('StoreId') ;
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku = [], SkuList = [], topicnamedata = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuStore",
                            "storeid":StoreId
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');  
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagData",
                            "storeid":StoreId
                        }
                    }
                    var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');    
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            TagData = [...responseTag.msg]
                        }
                    }
                    
                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryData"
                        }
                    }
                    var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');    
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            CategoryData = [...responseCategory.msg]
                        }
                    }

                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageData"
                        }
                    }
                    var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');     
                    if(typeof responsePromo == 'object'){
                        let status=responsePromo.Status;
                        if(status==1){
                            ImageData = [...responsePromo.msg]
                        }
                    }
                    
                    let reqObjSku = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceSkuData"
                        }
                    }
                    var responseSku = await socketRequestData(req,reqObjSku,websocket,game_id,'webstore');   
                    if(typeof responseSku == 'object'){
                        let status=responseSku.Status;
                        if(status==1){
                            MarketplaceSku = [...responseSku.msg]
                        }
                    }
                   
                    let reqObjTitle = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreTitle"
                        }
                    }
                    var responseTitle = await socketRequestData(req,reqObjTitle,websocket,game_id,'webstore');  
                    if(typeof responseTitle == 'object'){
                        let status=responseTitle.Status;
                        if(status==1){
                            topicnamedata = [...responseTitle.msg]
                        }
                    }

                    let reqObjSkuTitle = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuTitle"
                        }
                    }
                    var responseSkuTitle = await socketRequestData(req,reqObjSkuTitle,websocket,game_id,'webstore'); 
                    if(typeof responseSkuTitle == 'object'){
                        let status=responseSkuTitle.Status;
                        if(status==1){
                            SkuList = [...responseSkuTitle.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0){
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if(item.MarketPlaceSkuStatus == '1'){
                            publish = true;
                        }
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuId: item.StoreSkuId,
                                StoreTitle: item.StoreTitle,
                                MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                                MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                                PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                                TagName: (item.TagName != null)?[item.TagName]:[],
                                CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                                Price: (item.Price != null)?[item.Price]:[],
                                Currency: (item.Currency != null)?[item.Currency]:[],
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                                MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                                MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                                StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                                OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                            };
                        }else{
                            uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                            uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                            uniqueSkuData[skuId].Price.push(item.Price);
                            uniqueSkuData[skuId].Currency.push(item.Currency);
                            uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                            uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                            uniqueSkuData[skuId].TagName.push(item.TagName);
                            let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                            uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                            uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                            uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                            uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                        } 
                    });
                }
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    if(entry.MarketPlaceProductId.length > 0){
                        containsMapping = true;
                    }
                    return {
                        SkuId: parseInt(skuId),
                        StoreSkuId: entry.StoreSkuId,
                        StoreTitle: entry.StoreTitle,
                        MarketPlaceName: entry.MarketPlaceName,
                        MarketPlaceProductId: entry.MarketPlaceProductId,
                        Currency: entry.Currency,
                        Price: entry.Price,
                        Titles: entry.Titles,
                        PromoImageName: entry.PromoImageName,
                        TagName: entry.TagName,
                        CategoryName: entry.CategoryName,
                        MarketPlaceProductData: entry.MarketPlaceProductData,
                        MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                        StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                        OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                    };
                });
                
                let marketplaceArray = [];
                const resultObject = MarketplaceSku.reduce((acc, item) => {
                    const marketplaceName = item.MarketPlaceName;
                    if (!acc[marketplaceName]) {
                    acc[marketplaceName] = [];
                    }
                    if(!marketplaceArray.includes(marketplaceName.toLowerCase())){
                        marketplaceArray.push(marketplaceName.toLowerCase());
                    }
                    acc[marketplaceName].push(item);
                    return acc;
                }, {});
                SkuList = JSON.stringify(SkuList);
                res.view({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, published:publish, StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly, SkuList: SkuList, MarketplaceName : marketplaceArray, topicnamedata:topicnamedata});
            }else{
                if(!websocket || sails.config.SkuImageS3Bucket == undefined || sails.config.WebStoreDatabase == undefined){
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/marketplace?game_id='+game_id);
                }
                let result = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreData"
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            result = [...response.msg]
                        }
                    }
                }
                res.view({data:result,game_id_sub_header:game_id, IsViewerOnly: isViewerOnly});
            }
          } else {
            let publish = false;
            let containsMapping = false;
            let game_id=req.param('game_id');
            let StoreId=(typeof req.body.StoreId!= 'undefined')?req.body.StoreId:req.param('StoreId') ;
            let gameServicePermision = await checkServiceOfGame(req, game_id);
            let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku = [], SkuList = [], topicnamedata = [];
            if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getSkuStore",
                        "storeid": StoreId
                    }
                }
                var response =await socketRequestData(req,reqObj,websocket,game_id,'webstore');       
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        data = [...response.msg]
                    }
                }

                let reqObjTag = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getTagData"
                    }
                }
                var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');        
                if(typeof responseTag == 'object'){
                    let status=responseTag.Status;
                    if(status==1){
                        TagData = [...responseTag.msg]
                    }
                }

                let reqObjCategory = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getCategoryData"
                    }
                }
                var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');        
                if(typeof responseCategory == 'object'){
                    let status=responseCategory.Status;
                    if(status==1){
                        CategoryData = [...responseCategory.msg]
                    }
                }

                let reqObjPromo = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getPromoImageData"
                    }
                }
                var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');       
                if(typeof responsePromo == 'object'){
                    let status=responsePromo.Status;
                    if(status==1){
                        ImageData = [...responsePromo.msg]
                    }
                }
                
                let reqObjSku = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getMarketplaceSkuData"
                    }
                }
                var responseSku =await socketRequestData(req,reqObjSku,websocket,game_id,'webstore');          
                if(typeof responseSku == 'object'){
                    let status=responseSku.Status;
                    if(status==1){
                        MarketplaceSku = [...responseSku.msg]
                    }
                }
               
                let reqObjTitle = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getStoreTitle"
                    }
                }
                var responseTitle =  await socketRequestData(req,reqObjTitle,websocket,game_id,'webstore');      
                if(typeof responseTitle == 'object'){
                    let status=responseTitle.Status;
                    if(status==1){
                        topicnamedata = [...responseTitle.msg]
                    }
                }

                let reqObjSkuTitle = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getSkuTitle"
                    }
                }
                var responseSkuTitle = await socketRequestData(req,reqObjSkuTitle,websocket,game_id,'webstore');     
                if(typeof responseSkuTitle == 'object'){
                    let status=responseSkuTitle.Status;
                    if(status==1){
                        SkuList = [...responseSkuTitle.msg]
                    }
                }
            }
            const uniqueSkuData = {};
            if(data.length > 0){
                data.forEach((item) => {
                    const skuId = item.SkuId;
                    if(item.MarketPlaceSkuStatus == '1'){
                        publish = true;
                    }
                    if (!uniqueSkuData[skuId]) {
                        uniqueSkuData[skuId] = {
                            StoreSkuId: item.StoreSkuId,
                            StoreTitle: item.StoreTitle,
                            MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                            MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                            PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                            TagName: (item.TagName != null)?[item.TagName]:[],
                            CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                            Price: (item.Price != null)?[item.Price]:[],
                            Currency: (item.Currency != null)?[item.Currency]:[],
                            Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                            MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                            MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                            StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                            OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                        };
                    }else{
                        uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                        uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                        uniqueSkuData[skuId].Price.push(item.Price);
                        uniqueSkuData[skuId].Currency.push(item.Currency);
                        uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                        uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                        uniqueSkuData[skuId].TagName.push(item.TagName);
                        let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                        uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                        uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                        uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                        uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                    } 
                });
            }
            const result = Object.keys(uniqueSkuData).map((skuId) => {
                const entry = uniqueSkuData[skuId];
                if(entry.MarketPlaceProductId.length > 0){
                    containsMapping = true;
                }
                return {
                    SkuId: parseInt(skuId),
                    StoreSkuId: entry.StoreSkuId,
                    StoreTitle: entry.StoreTitle,
                    MarketPlaceName: entry.MarketPlaceName,
                    MarketPlaceProductId: entry.MarketPlaceProductId,
                    Currency: entry.Currency,
                    Price: entry.Price,
                    Titles: entry.Titles,
                    PromoImageName: entry.PromoImageName,
                    TagName: entry.TagName,
                    CategoryName: entry.CategoryName,
                    MarketPlaceProductData: entry.MarketPlaceProductData,
                    MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                    StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                    OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                };
            });
           
            let marketplaceArray = [];
            const resultObject = MarketplaceSku.reduce((acc, item) => {
                const marketplaceName = item.MarketPlaceName;
                if (!acc[marketplaceName]) {
                  acc[marketplaceName] = [];
                }
                if(!marketplaceArray.includes(marketplaceName.toLowerCase())){
                    marketplaceArray.push(marketplaceName.toLowerCase());
                }
                acc[marketplaceName].push(item);
                return acc;
            }, {});
            SkuList = JSON.stringify(SkuList);
            res.view({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, published:publish,StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly, SkuList:SkuList, MarketplaceName : marketplaceArray, topicnamedata: topicnamedata});
          } 
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.duplicateStorePricing',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            req.session.msg = 'Something went wrong.'
            res.redirect('/webstores/view')
        }
    },
    duplicateAndEditStorePricing: async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id=req.param('game_id');
                let StoreId=req.param('StoreId');
                let StoreTitle=req.param('StoreTitle');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                let gameServicePermision = await checkServiceOfGame(req,game_id);
                res.view({ game_id_sub_header: game_id, GameServiceAllowed: gameServicePermision, StoreId:StoreId, StoreTitle: StoreTitle, IsViewerOnly: isViewerOnly});
            } else {
                let publish = false;
                let containsMapping = false;
                let game_id=req.param('game_id');
                let StoreId=(typeof req.body.StoreId!= 'undefined')?req.body.StoreId : req.param('StoreId') ;
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let data = [], TagData = [], CategoryData = [], ImageData = [], MarketplaceSku = [], SkuList = [], topicnamedata = [], BackgroundImageData = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuStore",
                            "storeid": StoreId
                        }
                    }
                    var response =await socketRequestData(req,reqObj,websocket,game_id,'webstore');       
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            data = [...response.msg]
                        }
                    }

                    let reqObjTag = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getTagData"
                        }
                    }
                    var responseTag = await socketRequestData(req,reqObjTag,websocket,game_id,'webstore');        
                    if(typeof responseTag == 'object'){
                        let status=responseTag.Status;
                        if(status==1){
                            TagData = [...responseTag.msg]
                        }
                    }

                    let reqObjCategory = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getCategoryData"
                        }
                    }
                    var responseCategory = await socketRequestData(req,reqObjCategory,websocket,game_id,'webstore');        
                    if(typeof responseCategory == 'object'){
                        let status=responseCategory.Status;
                        if(status==1){
                            CategoryData = [...responseCategory.msg]
                        }
                    }

                    let reqObjPromo = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getPromoImageData"
                        }
                    }
                    var responsePromo = await socketRequestData(req,reqObjPromo,websocket,game_id,'webstore');       
                    if(typeof responsePromo == 'object'){
                        let status=responsePromo.Status;
                        if(status==1){
                            ImageData = [...responsePromo.msg]
                        }
                    }

                    let reqObjBackground = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getBackgroundImageData"
                        }
                    }
                    var responseBackground = await socketRequestData(req,reqObjBackground,websocket,game_id,'webstore');       
                    if(typeof responseBackground == 'object'){
                        let status=responseBackground.Status;
                        if(status==1){
                            BackgroundImageData = [...responseBackground.msg]
                        }
                    }
                    
                    let reqObjSku = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceSkuData"
                        }
                    }
                    var responseSku =await socketRequestData(req,reqObjSku,websocket,game_id,'webstore');          
                    if(typeof responseSku == 'object'){
                        let status=responseSku.Status;
                        if(status==1){
                            MarketplaceSku = [...responseSku.msg]
                        }
                    }
                    
                    let reqObjTitle = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getStoreTitle"
                        }
                    }
                    var responseTitle =  await socketRequestData(req,reqObjTitle,websocket,game_id,'webstore');      
                    if(typeof responseTitle == 'object'){
                        let status=responseTitle.Status;
                        if(status==1){
                            topicnamedata = [...responseTitle.msg]
                        }
                    }

                    let reqObjSkuTitle = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getSkuTitle"
                        }
                    }
                    var responseSkuTitle = await socketRequestData(req,reqObjSkuTitle,websocket,game_id,'webstore');     
                    if(typeof responseSkuTitle == 'object'){
                        let status=responseSkuTitle.Status;
                        if(status==1){
                            SkuList = [...responseSkuTitle.msg]
                        }
                    }
                }
                const uniqueSkuData = {};
                if(data.length > 0){
                    data.forEach((item) => {
                        const skuId = item.SkuId;
                        if(item.MarketPlaceSkuStatus == '1'){
                            publish = true;
                        }
                        if (!uniqueSkuData[skuId]) {
                            uniqueSkuData[skuId] = {
                                StoreSkuId: item.StoreSkuId,
                                StoreTitle: item.StoreTitle,
                                MarketPlaceName: (item.MarketPlaceName != null)?[item.MarketPlaceName]:[],
                                MarketPlaceProductId:(item.MarketPlaceProductId != null)?[item.MarketPlaceProductId]:[],
                                PromoImageName: (item.PromoImageName != null)?[item.PromoImageName]:[],
                                BackgroundImageName : (item.BackgroundImageName != null)?[item.BackgroundImageName]:[],
                                TagName: (item.TagName != null)?[item.TagName]:[],
                                CategoryName: (item.CategoryName != null)?[item.CategoryName]:[],
                                Price: (item.Price != null)?[item.Price]:[],
                                Currency: (item.Currency != null)?[item.Currency]:[],
                                Titles: (typeof item.SkuTitle != 'undefined') ? item.SkuTitle : '',
                                MarketPlaceProductData: (item.MarketPlaceProductData != null)?[JSON.parse(item.MarketPlaceProductData)]:[],
                                MarketPlaceSkuStatus: (item.MarketPlaceSkuStatus != null)?[item.MarketPlaceSkuStatus]:[],
                                StoreSkuMarketplaceId: (item.StoreSkuMarketplaceId != null)?[item.StoreSkuMarketplaceId]:[],
                                OldMarketPlaceSkuId: (item.OldMarketPlaceSkuId != null)?[item.OldMarketPlaceSkuId]:[],
                            };
                        }else{
                            uniqueSkuData[skuId].MarketPlaceName.push(item.MarketPlaceName);
                            uniqueSkuData[skuId].MarketPlaceProductId.push(item.MarketPlaceProductId);
                            uniqueSkuData[skuId].Price.push(item.Price);
                            uniqueSkuData[skuId].Currency.push(item.Currency);
                            uniqueSkuData[skuId].PromoImageName.push(item.PromoImageName);
                            uniqueSkuData[skuId].BackgroundImageName.push(item.BackgroundImageName);
                            uniqueSkuData[skuId].CategoryName.push(item.CategoryName);
                            uniqueSkuData[skuId].TagName.push(item.TagName);
                            let meta = (item.MarketPlaceProductData != null)?JSON.parse(item.MarketPlaceProductData):'';
                            uniqueSkuData[skuId].MarketPlaceProductData.push(meta);
                            uniqueSkuData[skuId].MarketPlaceSkuStatus.push(item.MarketPlaceSkuStatus);
                            uniqueSkuData[skuId].StoreSkuMarketplaceId.push(item.StoreSkuMarketplaceId);
                            uniqueSkuData[skuId].OldMarketPlaceSkuId.push(item.OldMarketPlaceSkuId);
                        } 
                    });
                }
                const result = Object.keys(uniqueSkuData).map((skuId) => {
                    const entry = uniqueSkuData[skuId];
                    if(entry.MarketPlaceProductId.length > 0){
                        containsMapping = true;
                    }
                    return {
                        SkuId: parseInt(skuId),
                        StoreSkuId: entry.StoreSkuId,
                        StoreTitle: entry.StoreTitle,
                        MarketPlaceName: entry.MarketPlaceName,
                        MarketPlaceProductId: entry.MarketPlaceProductId,
                        Currency: entry.Currency,
                        Price: entry.Price,
                        Titles: entry.Titles,
                        PromoImageName: entry.PromoImageName,
                        BackgroundImageName: entry.BackgroundImageName,
                        TagName: entry.TagName,
                        CategoryName: entry.CategoryName,
                        MarketPlaceProductData: entry.MarketPlaceProductData,
                        MarketPlaceSkuStatus: entry.MarketPlaceSkuStatus,
                        StoreSkuMarketplaceId: entry.StoreSkuMarketplaceId,
                        OldMarketPlaceSkuId: entry.OldMarketPlaceSkuId
                    };
                });
                
                let marketplaceArray = [];
                const resultObject = MarketplaceSku.reduce((acc, item) => {
                    const marketplaceName = item.MarketPlaceName;
                    if (!acc[marketplaceName]) {
                    acc[marketplaceName] = [];
                    }
                    if(!marketplaceArray.includes(marketplaceName.toLowerCase())){
                        marketplaceArray.push(marketplaceName.toLowerCase());
                    }
                    acc[marketplaceName].push(item);
                    return acc;
                }, {});
                SkuList = JSON.stringify(SkuList);
                return res.status(200).send({data:'',StoreSku:result,MarketplaceSku:resultObject,game_id_sub_header:game_id, TagData:TagData, CategoryData:CategoryData, ImageData:ImageData, BackgroundImageData:BackgroundImageData, published:publish,StoreId:StoreId, containsMapping:containsMapping, IsViewerOnly: isViewerOnly, SkuList:SkuList, MarketplaceName : marketplaceArray, topicnamedata: topicnamedata});
            } 
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.duplicateAndEditStorePricing',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            req.session.msg = 'Something went wrong.'
            res.redirect('/webstores/view')
        }
    },
    cloneStore: async function(req, res){
        try {
            if (req.method === 'GET'){
                req.session.msg = 'Something went wrong.'
                return res.redirect('/webstores/view');
            }else{
                let GameId = req.param('GameId');
                let title = req.param('title');
                let refid = req.param('refid');
                let StoreId = req.param('StoreId');
                let skuList = req.param('skuList');
                if(typeof skuList  != 'undefined'){
                    try {
                        skuList = JSON.parse(skuList);
                    } catch (error) {
                        skuList = skuList;
                    }
                    if(Array.isArray(skuList) && skuList.length > 0){
                        let reqObj = {
                            "action":"duplicateStore",
                            "data_from":"panel",
                            "StoreId":StoreId,
                            "StoreTitle":title,
                            "StoreRefId":refid,
                            "SkuList": skuList
                        }
                        let response = await socketRequestData(req,reqObj,websocket,GameId,'webstore');    
                        if (typeof response == 'object') {
                            let status = response.Status;
                            if (status == 1) {
                                req.session.msg = response.msg;
                                return res.status(200).send(true);
                            } else {
                                req.session.msg = response.msg;
                                return res.status(200).send(false);
                            }
                        }
                    }else{
                        req.session.msg = 'Invalid Sku List.'
                        return res.status('200').send(true);
                    }
                }else{
                    req.session.msg = 'Sku List not found in the request.'
                    return res.status('200').send(true);
                }
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoresController.duplicateStorePricing',
                line: 4776,
                error_at: Moment.getTimeForLogs()
            });
            req.session.msg = 'Something went wrong.'
            return res.redirect('/webstores/view');
        }
    },
    storeReport: async function(req, res){
        try {
            if (req.method == 'GET') {
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/view');
                }
                if (typeof sails.config.WebStoreDatabase == 'undefined') {
                    console.error('Config Values not Available');
                    return res.redirect('/webstores/view');
                }

                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                return res.view({ game_id_sub_header: game_id });
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.storeReport',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/view');
        }
    },
    getDayRangeReport: async function(req, res){
        try {
            if(req.method == 'GET'){
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(false);
                }
                if (typeof sails.config.WebStoreDatabase == 'undefined') {
                    console.error('Config Values not Available');
                    return res.status(200).send(false);
                }
                
                let startDate = req.param('startDate');
                let endDate = req.param('endDate');
                if('undefined' == typeof startDate || !(/^(\d{4})-(\d{2})-(\d{2})$/).test(startDate) || 'undefined' == typeof endDate || !(/^(\d{4})-(\d{2})-(\d{2})$/).test(endDate)){
                    req.session.msg = 'Please select a valid date range';
                    return res.status(200).send(false);
                }

                if(startDate > Moment.init().format('YYYY-MM-DD') || endDate > Moment.init().format('YYYY-MM-DD')){
                    req.session.msg = 'Start Date and End Date cannot be greater than current date';
                    return res.status(200).send(false);
                }

                if(startDate > endDate){
                    req.session.msg = 'Start Date cannot be greater than End date';
                    return res.status(200).send(false);
                }
                const currencyRatioJson = JSON.stringify(currencyUnitRatio);
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let selectResp = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getDayRangeReport",
                            "currencyratiojson":currencyRatioJson,
                            "startdate":startDate,
                            "enddate":endDate
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            selectResp = [...response.msg]
                        }
                    }
                }
                if('undefined' == typeof selectResp || !Array.isArray(selectResp)){
                    selectResp = [];
                }
                let finalResp = {};
                if(selectResp.length > 0){
                    selectResp.forEach((elem) => {
                        try{ elem.SuccessAmountJson = JSON.parse(elem.SuccessAmountJson); }catch(e){ elem.SuccessAmountJson = elem.SuccessAmountJson; }
                        if(Array.isArray(elem.SuccessAmountJson) && (elem.SuccessAmountJson).length > 0){
                            let localPricesJson = (elem.SuccessAmountJson).reduce((acc, curr) => {
                                let localPriceCurr = Object.keys(curr)[0];
                                let localPriceVal = Number(curr[localPriceCurr]);
                                if(localPriceVal >= 0){
                                    if(currencyUnitRatio[localPriceCurr.toUpperCase()]){
                                        localPriceVal /= currencyUnitRatio[localPriceCurr.toUpperCase()];
                                    }else{
                                        localPriceVal /= 100;
                                    }
    
                                    if (acc[localPriceCurr]) {
                                        acc[localPriceCurr].Amount += localPriceVal;
                                        acc[localPriceCurr].Count += 1;
                                    } else {
                                        acc[localPriceCurr] = {
                                            Amount: localPriceVal,
                                            Count: 1
                                        };
                                    }
                                }
                                return acc;
                            }, {});
                            elem.SuccessAmountJson = localPricesJson;
                        }else{
                            elem.SuccessAmountJson = null;
                        }
                        Object.keys(elem).forEach((objKey) => {
                            if(!["SysCreationDate", "MarketPlaceProductId", "StoreId", "SkuId", "StoreTitle", "SkuTitle", "SuccessAmountJson"].includes(objKey)){
                                elem[objKey] = Number(elem[objKey]);
                            }
                        });
                        elem.SysCreationDate = elem.SysCreationDate.split(' ')[0];
                        if(!finalResp[elem.SysCreationDate]){
                            finalResp[elem.SysCreationDate] = {};
                        }
                        if(!finalResp[elem.SysCreationDate][elem.StoreId]){
                            finalResp[elem.SysCreationDate][elem.StoreId] = [];
                        }
                        finalResp[elem.SysCreationDate][elem.StoreId].push(elem);
                    });
                }
                for (let date in finalResp) {
                    let dateTotals = {};
                    for (let storeId in finalResp[date]) {
                        let currStore = finalResp[date][storeId];
                        finalResp[date][storeId] = {
                            "SkuList": currStore,
                        }
                        let totals = {};
                        for (let i in finalResp[date][storeId]['SkuList']) {
                            let currSku = finalResp[date][storeId]['SkuList'][i];
                            Object.keys(currSku).forEach((elem) => {
                                if (!["SysCreationDate", "StoreId", "SkuId", "StoreTitle", "SkuTitle", "SuccessAmountJson"].includes(elem)) {
                                    if (!totals[elem]) {
                                        totals[elem] = 0;
                                    }
                                    totals[elem] += currSku[elem];
                                }
                            });
                        }
                        finalResp[date][storeId]['StoreTotals'] = totals;
                        Object.keys(totals).forEach((elem) => {
                            if (!dateTotals[elem]) {
                                dateTotals[elem] = 0;
                            }
                            dateTotals[elem] += totals[elem];
                        });
                    }
                    finalResp[date]['DateTotals'] = dateTotals;
                }

                let storeData = finalResp;

                if(Object.keys(storeData).length < 1){
                    req.session.msg = 'No data found for this date range';
                    return res.status(200).send(false);
                }

                return res.status(200).send(storeData);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.getDayRangeReport',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    getUserSkuPurchase: async function(req, res){
        try {
            if(req.method == 'POST'){
                let game_id = req.param('game_id');
                if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame != 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.status(200).send(false);
                }
                if (typeof sails.config.WebStoreDatabase == 'undefined') {
                    console.error('Config Values not Available');
                    return res.status(200).send(false);
                }
                let startDate = req.param('startDate');
                let endDate = req.param('endDate');
                let storeSkuMarketplaceId = req.param('storeSkuMarketplaceId');
                if('undefined' == typeof startDate || !(/^(\d{4})-(\d{2})-(\d{2})$/).test(startDate) || 'undefined' == typeof endDate || !(/^(\d{4})-(\d{2})-(\d{2})$/).test(endDate)){
                    return res.status(200).send('Please select a valid date range');
                }

                if(startDate > Moment.init().format('YYYY-MM-DD') || endDate > Moment.init().format('YYYY-MM-DD')){
                    return res.status(200).send('Start Date and End Date cannot be greater than current date');
                }

                if(startDate > endDate){
                    return res.status(200).send('Start Date cannot be greater than End date');
                }
                if(storeSkuMarketplaceId<=0){
                    return res.status(200).send('StoreSkuMarketplaceId id is not valid');
                }
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                let selectResp = [];
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getUserSkuPurchase",
                            "storeSkuMarketplaceId":storeSkuMarketplaceId,
                            "startDate":startDate,
                            "endDate":endDate
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            selectResp = [...response.msg]
                        }
                    }
                }
                
                if(selectResp.length < 1){
                    return res.status(200).send('No data found for this date range');
                }

                return res.status(200).send(selectResp);
            }
        } catch (error) {
            console.error({
                error: error,
                service: 'WebStoreController.getUserSkuPurchase',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.status(500).send("Internal Server Error");
        }
    },
    getmeta : async function(req,res){
        let game_id = req.param('game_id');
        if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
            game_id = req.session.AdminCurrentGame;
        }
        let MarketPlaceProductData=[];
        let skuMetaData =[];
        let gratificationdata=[];
        let action=req.body.action;
        if(action === "viewMarketplaceMeta") {
            let marketPlaceSkuId=req.body.marketPlaceSkuId;
            let MarketPlaceGameId = req.body.MarketPlaceGameId;
            let reqObj = { 
                "action":"getPanelData",
                "parameters":{
                    "name": "viewSkuOnMarketplaceMeta",
                    "marketplaceskuid": marketPlaceSkuId,
                    "marketplacegameid": MarketPlaceGameId 
                }
            }
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    MarketPlaceProductData = [...response.msg]
                }
                let meta = JSON.parse(MarketPlaceProductData[0].MarketPlaceProductData) || [];
                return res.json({ Status: 1, msg: meta });
            }
        }
        else if (action === "skumeta") {
            let SkuId = req.body.SkuId;    
            let reqObj = {
                action: "getPanelData",
                parameters: {
                    name: "getSkuMeta",
                    skuid: SkuId
                }
            };
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
        
            if (typeof response === 'object' && response.Status === 1) {
                skuMetaData = response.msg || [];
        
                if (skuMetaData.length > 0) {
                    let meta = JSON.parse(skuMetaData[0].Meta || '{}');    
                    return res.json({ Status: 1, msg: meta });
                } else {
                    return res.json({ Status: 0, msg: "No metadata found for the given SKU." });
                }
            } else {
                console.error("Invalid response from the server:", response);
                return res.json({ Status: 0, msg: "Invalid response from the server." });
            }
        }else {
            let gratificationid = req.body.gratificationid;
        
            let reqObj = {
                action: "getPanelData",
                parameters: {
                    name: "getGratificationJson",
                    gratificationid: gratificationid
                }
            };
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
            if (typeof response === 'object' && response.Status === 1) {
                gratificationdata = response.msg || [];
        
                if (gratificationdata.length > 0) {
                    let meta = JSON.parse(gratificationdata[0].GratificationJson || '{}');    
                    return res.json({ Status: 1, msg: meta });
                } else {
                    return res.json({ Status: 0, msg: "No getGratificationJson found for the given getGratification." });
                }
            } else {
                console.error("Invalid response from the server:", response);
                return res.json({ Status: 0, msg: "Invalid response from the server." });
            }
        }
    },
    getMappedStoreOfSku: async function(req, res){
        try{
            let game_id = req.param('GameId');
            if (typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined') {
                game_id = req.session.AdminCurrentGame;
            }
            let StoreList = [];
            let SkuId=req.param('skuid');
            let reqObj = {
                "action":"getPanelData",
                "parameters":{
                    "name":"getMappedStoreOfSku",
                    "skuId":SkuId
                }
            }
            var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
            if(typeof response == 'object'){
                let status=response.Status;
                if(status==1){
                    StoreList = [...response.msg]
                }else{
                    console.log("Invalid response from the server:", response.msg);
                }
                return res.json(StoreList);
            }
        }catch(error){
            console.error("Some error occured while fetching mapped Store of Sku:", error);
            return res.json([]);
        }
    },
    editSkuMarketplacePricing: async function(req, res){
        try{
            let isViewerOnly = isViewOnly(req);
            if(req.method == 'GET'){
                let game_id = req.param('game_id');
                let marketplaceSkuId = req.param('mpsid');
                let MarketPlaceGameId = req.param('MarketPlaceGameId');
                let MarketPlaceName = req.param('MarketPlaceName');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }

                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl != false) return res.redirect(redirectUrl);

                let finalData = {};
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                if(typeof gameServicePermision === 'object' && gameServicePermision.length > 0){
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            name: "getMarketplaceSkuPricingData",
                            MarketplaceSkuId: marketplaceSkuId
                        }
                    }
                    let response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                    if(typeof response == 'object'){
                        let status = response.Status;
                        if(status == 1){
                            finalData = response.msg
                        }
                    }
                }

                let marketProductData = JSON.parse(finalData['MarketPlaceProductData']);
                try{ marketProductData = JSON.parse(finalData['MarketPlaceProductData']); }catch(e){ marketProductData = {}; }
                let currentLocalizedPrices = ('undefined' != typeof marketProductData['prices']) ? marketProductData['prices'] : {};
                for(let i in currentLocalizedPrices){
                    currentLocalizedPrices[i] = Number(currentLocalizedPrices[i]);
                    currentLocalizedPrices[i] /= (currencyUnitRatio[i.toUpperCase()] ? currencyUnitRatio[i.toUpperCase()] : 100);
                }

                finalData['Price'] = Number(finalData['Price']);
                finalData['Price'] /= (currencyUnitRatio[finalData['Currency'].toUpperCase()] ? currencyUnitRatio[finalData['Currency'].toUpperCase()] : 100);

                delete finalData['ConvertedPrices'][finalData['Currency'].toUpperCase()];
                for(let currency in finalData['ConvertedPrices']){
                    finalData['ConvertedPrices'][currency] /= (currencyUnitRatio[currency.toUpperCase()] ? currencyUnitRatio[currency.toUpperCase()] : 100) 
                }

                return res.view({ game_id_sub_header: game_id, IsViewerOnly: isViewerOnly, marketplaceSkuId: marketplaceSkuId, marketPlaceProductId: finalData['MarketPlaceProductId'], marketplaceProductData: marketProductData, skuLocalPrices: currentLocalizedPrices, defaultPrice: finalData['Price'], defaultCurrency: finalData['Currency'], convertedPrices: finalData['ConvertedPrices'], MarketPlaceGameId, MarketPlaceName });
            }else if(req.method == 'POST'){
                let gameId = req.body.GameId;
                let MarketPlaceGameId = req.body.MarketPlaceGameId;
                let MarketPlaceName = req.body.MarketPlaceName;

                if (typeof gameId === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    gameId = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame != 'undefined' && gameId != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/marketplace?game_id=' + gameId);
                }

                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof gameId) ? ('?game_id='+gameId) : ''));
                }

                let marketplaceSkuId = req.body.MarketplaceSkuId;
                let marketplaceProductId = req.body.MarketPlaceProductId;
                let currencyPriceList = JSON.parse(req.body.CurrencyPriceList);

                for(let currency in currencyPriceList){
                    currencyPriceList[currency] = Number(currencyPriceList[currency]);
                    currencyPriceList[currency] *= (currencyUnitRatio[currency] ? currencyUnitRatio[currency] : 100);
                }

                let reqObj = {
                    action: "editSkuMarketplacePricing",
                    MarketplaceSkuId: marketplaceSkuId,
                    MarketplaceProductId: marketplaceProductId,
                    CurrencyPricingList: currencyPriceList,
                }
                let response = await socketRequestData(req,reqObj,websocket,gameId,'webstore');
                if (typeof response == 'object') {
                    let status = response.Status;
                    if (status == 1) {
                        req.session.msg = response.msg;
                        return res.redirect('/webstores/viewSkuOnMarketplace?game_id='+gameId+'&MarketPlaceGameId='+MarketPlaceGameId+'&MarketPlaceName='+MarketPlaceName);
                    } else {
                        req.session.msg = response.msg;
                        return res.redirect('/webstores/viewSkuOnMarketplace?game_id='+gameId+'&MarketPlaceGameId='+MarketPlaceGameId+'&MarketPlaceName='+MarketPlaceName);
                    }
                }

                req.session.msg='Something went wrong.';
                return res.redirect('/webstores/viewSkuOnMarketplace?game_id='+gameId+'&MarketPlaceGameId='+MarketPlaceGameId+'&MarketPlaceName='+MarketPlaceName);
            }
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.editSkuMarketplacePricing',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/marketplace');
        }
    },
    editSkuMarketPlace : async function(req,res){
        try {
            let isViewerOnly = isViewOnly(req);
            if(req.method=='GET'){
                let game_id=req.param('game_id');
                if(typeof game_id == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    game_id = req.session.AdminCurrentGame;
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof game_id) ? ('?game_id='+game_id) : ''));
                }
                let redirectUrl = await checkServiceOfGame(req,game_id,1);
                if(redirectUrl!=false) return res.redirect(redirectUrl);

                let MarketPlaceGameId=req.param('Marketplacegameid');
                let MarketPlaceName=req.param('MarketPlaceName');
                let purchaseType;
                let price=req.param('prices');
                let currency=req.param('currency');
                let MarketPlaceProductId=req.param('MarketPlaceProductId');
                let actionType=req.param('actionType');
                let marketPlaceSkuId=req.param('marketplaceskuid');
                let MarketPlaceProductData;
                let deeplink=[];
                let MarketPlaceNameforsku = [];
                let gameServicePermision = await checkServiceOfGame(req, game_id);
                
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getMarketplaceNameForSku",
                            "marketplacename":MarketPlaceName
                        }
                    }
                    var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            MarketPlaceNameforsku = [...response.msg]
                        }
                    }
                }
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                let reqObj = { 
                    "action":"getPanelData",
                    "parameters":{
                        "name": "viewSkuOnMarketplaceMeta",
                        "marketplaceskuid": marketPlaceSkuId,
                        "marketplacegameid": MarketPlaceGameId 
                    }
                }
                var response = await socketRequestData(req,reqObj,websocket,game_id,'webstore');      
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        MarketPlaceProductData = [...response.msg]
                        }
                    }
                }
                let meta = JSON.parse(MarketPlaceProductData[0].MarketPlaceProductData) || [];
                purchaseType=meta.purchaseType;
                deeplink=meta.deeplink || [];
                
                res.view({MarketPlaceGameId:MarketPlaceGameId,MarketPlaceName:MarketPlaceName,game_id_sub_header:game_id,MarketPlaceNameforsku:MarketPlaceNameforsku,purchaseType:purchaseType,price:price,currency:currency,MarketPlaceProductId:MarketPlaceProductId,deeplink:deeplink,actionType:actionType,marketPlaceSkuId:marketPlaceSkuId});
            }
            else{
                let MarketPlaceName=req.body.MarketPlaceName;
                let MarketPlaceGameId=req.body.MarketPlaceGameId;
                let GameId=req.body.GameId;
                if(typeof GameId == 'undefined' && req.session.AdminCurrentGame != 'undefined'){
                    GameId = req.session.AdminCurrentGame;
                }else if(typeof req.session.AdminCurrentGame !='undefined' && GameId != req.session.AdminCurrentGame){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/webstores/marketplace?game_id=' + GameId);
                }
                if(isViewerOnly){
                    req.session.msg = 'User has view access only';
                    return res.redirect('/webstores/marketplace' + (('undefined' != typeof GameId) ? ('?game_id='+GameId) : ''));
                }
                let price=req.body.price;
                let productId=req.body.productId;
                let originalproductid=req.body.originalproductid;
                let currency=req.body.currency;
                let video=req.body.video;
                let marketPlaceSkuId=JSON.parse(req.body.marketPlaceSkuId);
                let unit='PAISA';
                if(currency == 'USD'){
                    unit='CENTS';
                }
                let duplicateData = [];
                let gameServicePermision = await checkServiceOfGame(req, GameId);
                if (typeof gameServicePermision === 'object' && gameServicePermision.length > 0) {
                    if(originalproductid !== productId){
                    let reqObjDuplicate = {
                        "action":"getPanelData",
                        "parameters":{
                            "name": "getDuplicateMarketplace",
                            "marketplacegameid" :MarketPlaceGameId,
                            "marketplaceproductid": productId
                        }
                    }
                    var responseDuplicate = await socketRequestData(req,reqObjDuplicate,websocket,GameId,'webstore');     
                    if(typeof responseDuplicate == 'object'){
                        let status=responseDuplicate.Status;
                        if(status==1){
                            duplicateData = [...responseDuplicate.msg]
                        }
                    }
                if(duplicateData && duplicateData[0].count > 0){
                    req.session.msg='This MarketPlaceProductId is already Present for this game';
                    return res.redirect('/webstores/viewSkuOnMarketplace?MarketPlaceGameId=' + MarketPlaceGameId + '&MarketPlaceName=trinitystore&game_id=' + GameId); 
                }
            }
            }
                price=price.split(" ");
                let reqObj={
                    "action":"updateMarketplaceSkuPricing",
                    "MarketPlaceGameId":MarketPlaceGameId,
                    "MarketPlaceSkuId":marketPlaceSkuId,
                    "MarketPlaceProductId":productId,
                    "Price":price[0]*100,
                    "currency":currency,
                    "Unit":unit
                }
                let MarketPlaceProductData={
                    "purchaseType":req.body.RefPurchaseType,
                };
                if(typeof video != 'undefined' && video != ""){
                    MarketPlaceProductData["deeplink"]=video;
                }
                reqObj["MarketPlaceProductData"]=JSON.stringify(MarketPlaceProductData);
                MarketPlaceName=MarketPlaceName.toLowerCase();
                var response =await socketRequestData(req,reqObj,websocket,GameId,'webstore'); 
                if(typeof response== 'object'){
                    let message=(typeof response.body != 'undefined' && typeof response.body.msg != 'undefined')? response.body.msg : 'Something went wrong.';
                    if(response.Status==1){
                            req.session.msg = 'UPDATE SUCCESSFUL';    
                            return res.redirect('/webstores/viewSkuOnMarketplace?MarketPlaceGameId=' + MarketPlaceGameId + '&MarketPlaceName=trinitystore&game_id=' + GameId); 
                    }else{
                        req.session.msg = message  ;
                    }
                }
            }
        }catch(error){
            console.error({
                error: error,
                service: 'WebStoresController.editSkuMarketPlace',
                line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''),
                error_at: Moment.getTimeForLogs()
            });
            return res.redirect('/webstores/viewSkuOnMarketplace?MarketPlaceGameId=' + MarketPlaceGameId + '&MarketPlaceName=trinitystore&game_id=' + GameId); 
        }

    }
}
async function checkServiceOfGame(req,game_id,redirect=false){
    if(isValidUserGame(req,game_id) && isValidUserRole(req,['SUPER_ADMIN','TRINITY STORE'])){
        let gameQuery = `select GameName,GameAPPID,GameToken from game_endpoints ge join game_master gm on ge.AppID=gm.GameAPPID where gm.GameId=${game_id} and ge.module='webstore' and ge.status=1 and gm.status=1 and ge.EndPointType='websocket'`;
        let result = (await sails.getDatastore("slave").sendNativeQuery(gameQuery, [])).rows;
        if(redirect==false){
            return result;
        }else if(!result || result.length<1){
            return '/webstores/marketplace?game_id='+game_id;
        }
    }
    return false;
}
function isViewOnly(req){
    return ('undefined' != typeof req.session.IsViewerOnly) ? req.session.IsViewerOnly : 0;
}
async function checkUrlStatus(url) {
    const http = require('http');
    const https = require('https');
    const client = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
        client.get(url, { method: 'HEAD' }, (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                resolve(true);
            } else {
                resolve(false);
            }
        }).on('error', (error) => {
            resolve(false);
        });
    });
}

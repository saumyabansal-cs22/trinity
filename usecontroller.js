const AWS = require('aws-sdk');
const { createHash, createHmac } = require('crypto');
const WebStoreDatabase = sails.config.WebStoreDatabase;
var balanceTypeShow = {
    'D': 'DepositBalance',
    'W': 'WinningBalance',
    'B': 'BonusBalance',
    'P': 'PromoBalance'
}
const {socketRequestData} = require('../services/WebsocketService');
const {isValidUserGame,escapeChar,isValidUserRole, postRequest} = require('../services/UtilService');
let nonCashPermissions = (typeof sails.config.nonCashPermissions == 'undefined') ? 0 : sails.config.nonCashPermissions;
let cashPermissionForGames= (typeof sails.config.cashPermissionForGames == 'undefined') ? [] : sails.config.cashPermissionForGames;
let websocket = typeof sails.config.WebsocketEndPointUrl!='undefined'?sails.config.WebsocketEndPointUrl:false;
module.exports = {
    viewDetails: async (req, res) => {
        try {
            var gocid = req.param("gocid");
            let game_id = req.param("game_id");
            let isViewerOnly = isViewOnly(req);
            if(game_id>0 && (req.session.adminRoles=='SUPER_ADMIN' || req.session.adminGames.includes(game_id))){
               req.session.AdminCurrentGame=game_id;
            }
            let selectResp=[];
            let data=[];
            if (!game_id && (typeof req.session.AdminCurrentGame !== 'undefined')) {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';  
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            } 
            let queryForRegion = `SELECT Value FROM game_settings WHERE GameID = $1`;
            let result = await sails.getDatastore('slave').sendNativeQuery(queryForRegion, [game_id]);
            let region = result.rows || [];
            let isGameRegionUS = region.some(r => r.Value === 'us-east-1');
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            
            let unsubscribedUsers = [];
            let cashPermissionForGames = (typeof sails.config.cashPermissionForGames == 'undefined') ? [] : sails.config.cashPermissionForGames;
            let selectSql=`SELECT gpm.GOCID, gpm.OCID, gpm.KYCID, gm.GameName, gpm.ScreenName as screen_name, gpm.Status, gm.GameID, gm.WalletAllowed, gm.WalletLabel, gu.guest_id as guest_id FROM game_player_master gpm JOIN game_master gm ON gm.GameID = gpm.GameID LEFT JOIN guest_users gu ON gu.GAMEID = gm.GameID AND gu.GUESTID = gpm.GUESTID WHERE gpm.GOCID =  $1;`;

            if(cashPermissionForGames.includes(Number(game_id))){
                selectSql = `SELECT aa.username as callingAdmin, gpm.GOCID, gm.GameName, gpm.ScreenName as screen_name, gpm.Status, gm.GameID, gm.WalletAllowed, gm.WalletLabel, pp.*, pkd.FirstName as fn, pkd.LastName as ln, pkd.DOB as db, pkd.Gender as gdr, IF(cu.call_unsubscribetill > DATE(NOW()), cu.call_status, 0) as unsubscribeCalling, IF(cu.sms_unsubscribetill > DATE(NOW()), cu.sms_status, 0) as unsubscribeSms,gu.guest_id as guest_id  FROM game_player_master gpm LEFT JOIN player_kyc_detail pkd ON gpm.KYCID = pkd.ID LEFT JOIN player_profile pp ON gpm.OCID = pp.OCID JOIN game_master gm ON gm.GameID = gpm.GameID LEFT JOIN calling_unsubscribe cu ON cu.gocid = gpm.GOCID LEFT JOIN calling_data cd ON cd.gocid = gpm.GOCID LEFT JOIN acl_admins aa ON cd.AgentID = aa.admin_id LEFT JOIN guest_users gu ON gu.GAMEID = gm.GameID AND gu.GUESTID = gpm.GUESTID WHERE gpm.GOCID = $1;`
            }
            if(!cashPermissionForGames.includes(Number(game_id))){
                let reqObj = {
                    action: "getPanelData",
                    parameters: {
                        name: "getUnsubscribedUsers",
                        gocid: gocid
                    }
                };
                unsubscribedUsers = await socketRequestData(req, reqObj, websocket, game_id,'webstore');
                if (unsubscribedUsers?.Status == 1) {
                    unsubscribedUsers = unsubscribedUsers.msg;
                }else if (unsubscribedUsers?.Status == 0) {
                    unsubscribedUsers = [];
                }

                let gameServicePermission = await checkServiceOfGame(req, game_id);
                let viewDetailsReq = {
                    action: "getPanelData",
                    parameters: {
                        name: "viewDetails",
                        gocid: gocid 
                    }
                };
            
                let response = await socketRequestData(req, viewDetailsReq, websocket, game_id,'webstore');
                if (Array.isArray(gameServicePermission) && gameServicePermission.length > 0) {
                    if (response?.Status === 1) {
                        selectResp = [...response.msg];
                    }
                }
            }

            var extensionObject = null;
            var cdInfo =null;
            var callingUrl =null;
            if(req.session.is_caller) {
                var adminId=req.session.adminUserId;
                var callingUrl='';
                var md5 = require('md5'); 
                var timestamp = Math.floor(new Date().getTime() / 1000);
                var hash=md5(adminId+gocid+sails.config.callingFromHomeKey+timestamp);
                callingUrl=sails.config.dialerurl+'dialer/dialer.php?aid='+adminId+'&gid='+gocid+'&hash='+hash+'&time='+timestamp

                var cdInfo =  (cashPermissionForGames.includes(Number(game_id))) ? [] : await findLid(adminId, gocid);
                if(cdInfo.length > 0) {
                    var lid = cdInfo.id;
                } else {
                    var lid  = Math.floor(new Date().getTime() / 1000);
                }
                if(lid!='' && callingUrl!=''){
                    callingUrl += '&lid='+lid;
                }
                var query = `SELECT username, Mobile AS adminMobile, extensionNumber, dialPlanNumber, extensionNumber2, dialPlan2Number, alias_name,otpLogin FROM acl_admins WHERE admin_id = $1`;
                let adminData = (await sails.getDatastore("slave").sendNativeQuery(query, [adminId])).rows;
                if (adminData.length > 0) {
                    extensionObject = adminData;
                }
            }
            if(!cashPermissionForGames.includes(Number(game_id)) && !isGameRegionUS) {
                let reqObjss = {
                    action: "getPanelData",
                    parameters: {
                        name: "getUserDataFornonCashPermissions",
                        gocid: gocid
                    }
                };
            
                let responsess = await socketRequestData(req, reqObjss, websocket, game_id,'webstore');
                if (responsess?.Status === 1) {
                    data = [...responsess.msg];
                }
            } else {
                data = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;
            }
            if (!data || data.length == 0) return res.redirect('/admin/admindashboard');
            if(typeof data[0] != 'undefined' && typeof data[0].GameID != 'undefined' && data[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';  
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(data.length > 0){
                if(data[0].OCID != null && typeof data[0].Mobile == 'undefined'){
                    let player_profile_query = `SELECT * FROM player_profile WHERE OCID = $1;`;
                    let player_profile_data = (await sails.getDatastore("slave").sendNativeQuery(player_profile_query, [data[0].OCID])).rows;
                    if(player_profile_data && player_profile_data.length > 0){
                        for(let i in player_profile_data[0]){
                            data[0][i] = player_profile_data[0][i];
                        }
                    }
                } 
                if(data[0].KYCID != null && typeof data[0].fn == 'undefined'){
                    let player_kyc_query = `SELECT FirstName as fn, LastName as ln, DOB as db, Gender as gdr FROM player_kyc_detail WHERE ID = $1;`;
                    let player_kyc_data = (await sails.getDatastore("slave").sendNativeQuery(player_kyc_query, [data[0].KYCID])).rows;
                    if(player_kyc_data && player_kyc_data.length > 0){
                        for(let i in player_kyc_data[0]){
                            data[0][i] = player_kyc_data[0][i];
                        }
                    }
                }
            }
            let walletLabelMap = {};
            if(data[0].WalletAllowed && data[0].WalletLabel) {
                let walletAllowedArray = data[0].WalletAllowed.split(",");
                let walletLabelArray = data[0].WalletLabel.split(",");
                if(walletAllowedArray.length ==  walletLabelArray.length) {
                    for(let i = 0; i < walletAllowedArray.length; i++) {
                        walletLabelMap[walletAllowedArray[i]] = walletLabelArray[i];
                    }
                }
            }
            let gameSetting = await UtilService.getGameSettingFromCache(data[0].GameID);
            let gameSettingCurrency = gameSetting['Game_Currency'];

            let tags = `select group_concat(tm.Name) as tags from tag_user tu join tag_master tm on tm.id = tu.tag_id where tu.gocid =$1 AND tu.status = 1 AND tm.status = 1`;
            let tagData = (await sails.getDatastore("slave").sendNativeQuery(tags, [gocid])).rows;
            let walletData = [];    
            if(cashPermissionForGames.includes(Number(game_id))){
                let walletSql = `SELECT wm.WalletID, guw.WalletLabel, wm.Amount, cm.CurrencyShortenText, cm.CurrencyDisplayUnit FROM game_user_wallet guw JOIN wallet_master wm ON wm.WalletID = guw.WalletID JOIN currency_master cm ON cm.CurrencyID = wm.CurrencyID WHERE guw.GOCID = $1;`
                let walletRes = (await sails.getDatastore("slave").sendNativeQuery(walletSql, [gocid])).rows;
                walletRes.forEach(elem => {
                    let walletLabel = elem.WalletLabel;//getWalletPropertyByDecimalVal(elem.WalletLabel);
                    if (walletLabel && walletLabelMap[walletLabel]) {
                        walletData[walletLabelMap[walletLabel]] = [];
                        walletData[walletLabelMap[walletLabel]]['amount'] = elem.Amount || 0;
                        walletData[walletLabelMap[walletLabel]]['walletId'] = elem.WalletID || 0;
                        walletData[walletLabelMap[walletLabel]]['CurrencyShortenText'] = elem.CurrencyShortenText || 0;
                        walletData[walletLabelMap[walletLabel]]['CurrencyDisplayUnit'] = elem.CurrencyDisplayUnit || 0;
                        walletData[walletLabelMap[walletLabel]]['WalletLabel'] = elem.WalletLabel || '';
                    }
                });
            }   
            let currencyConvData = gameSetting['CURRENCY_CONVERSION_FOR_ONE_INR'];
            if(!currencyConvData)currencyConvData = 1;
            return res.view({ gocid: gocid,selectResp:selectResp,unsubscribedUsers:unsubscribedUsers, profileData: data[0], walletData: walletData, page_name: 'viewDetails',currencyConv: currencyConvData,gameSettingCurrency: gameSettingCurrency,tagData:tagData,cdInfo:cdInfo,callingUrl:callingUrl,extensionObject:extensionObject,cashPermissionForGames:cashPermissionForGames.includes(Number(game_id)),IsViewerOnly: isViewerOnly});
        } catch (error) {
            console.error({ error: error, service: 'UserController.viewDetails', line: 11, error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    profileFieldUpdate: async (req, res) => {
        try {
            let { gocid, oldValue, newValue, type } = req.allParams();
            let adminId = req.session.adminUserId;
            if (!gocid || !type || !newValue) {
                return res.status(500).send("Required params empty.");
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            
            let columnMap = {
                'FirstName': {
                    columnName: 'FirstName',
                    showValue: 'First Name'
                },
                'LastName': {
                    columnName: 'LastName',
                    showValue: 'Last Name'
                },
                'ScreenName': {
                    columnName: 'ScreenName',
                    showValue: 'Screen Name'
                },
                'Gender': {
                    columnName: 'Gender',
                    showValue: 'Gender'
                }
            };
            if(cashPermissionForGames.includes(Number(game_id))){
                let selectSql = `SELECT gpm.OCID, gpm.GameID, gm.GameAPPID FROM game_player_master gpm JOIN game_master gm ON gpm.GameID = gm.GameID WHERE GOCID = $1;`;
                selectRes = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;    
                }else{
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"profileFieldUpdataData",
                            "gocid":gocid,
                        },
                    }
                    selectRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                }
            let ocid = selectRes && selectRes.length ? selectRes[0]['OCID'] : null;
            if(!ocid) return res.status(500).send("Invalid User."); 
            if(!columnMap[type])  return res.status(500).send("Invalid type.");

            if(type == 'ScreenName') {
                let checkScreenNameSql = `SELECT 1 FROM game_player_master WHERE GameID = $1 AND GOCID <> $2 AND ScreenName = $3;`;
                let checkScreenNameRes = (await sails.getDatastore("slave").sendNativeQuery(checkScreenNameSql, [selectRes[0].GameID, gocid, newValue])).rows;
                if(checkScreenNameRes && checkScreenNameRes.length) {
                    return res.status(500).send("Screen Name already exists for this game. Please enter other name.");
                }
            }



            let userUpdateSql = ``;
            let params = [];
            if(type == 'ScreenName') {
                userUpdateSql = `UPDATE game_player_master SET ScreenName = $1 WHERE GOCID = $2;`;
                params = [newValue, gocid];
            } else {
                userUpdateSql = `UPDATE player_kyc_detail SET ${columnMap[type].columnName} = $1 WHERE ID = (SELECT KYCID FROM game_player_master WHERE GOCID = $2);`;
                params = [newValue, gocid];
            }
            let logText = `${columnMap[type].showValue} Change from ${oldValue} to ${newValue} for OCID is ${ocid}`;
            if(cashPermissionForGames.includes(Number(game_id))){
                let logSql = `INSERT INTO player_change_log (admin_id,OCID,log_changes,User_state_change) VALUES ($1, $2, $3, $4);`;
            await sails.getDatastore("master").sendNativeQuery(logSql, [adminId,ocid,`${type} Update`, logText]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"insertLog",
                        "adminid":adminId,
                        "ocid":ocid,
                        "logchanges":`${type} update`,
                        "logtext":logText
                    }
                }
              await socketRequestData(req,reqObj,websocket,game_id,'webstore');   
            }
            let userDataObj = {
                game_id : selectRes[0].GameID,
                admin_id : adminId,
                gocid : gocid,
                type : "profile",
                old_obj : { [columnMap[type].columnName] : oldValue},
                new_obj :  { [columnMap[type].columnName] : newValue},
                GameAPPID: selectRes[0]['GameAPPID'],
            };
            await sails.getDatastore("master").sendNativeQuery(userUpdateSql, params);
            UtilService.addUserQueueAndNotify(userDataObj);
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.profileFieldUpdate', line: 31, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    mobileUpdate: async (req, res) => {
        try {
            let { ocid, gocid, mobileNo, newMobileNumber, type } = req.allParams();
            let adminId = req.session.adminUserId;
            let checkRes =[];
            let selectRes=[];
            if (!ocid || !gocid || !newMobileNumber) {
                return res.status(500).send("Required params empty.");
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let selectSql = `SELECT OCID, gm.GameID, gm.GameAPPID FROM game_player_master gpm JOIN game_master gm ON gpm.GameID = gm.GameID WHERE GOCID = $1;`;
            selectRes = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getMobileUpdateInfo",
                        "gocid":gocid
                    }
                }
                selectRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');  
            }
            if(!selectRes || selectRes.length == 0) {
                return res.status(500).send("Invalid User.");
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let checkSql = `SELECT 1 FROM player_profile WHERE Mobile = $1;`;
            checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [newMobileNumber])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"checkForMobileUpdate",
                        "mobile":newMobileNumber
                    }
                }
                checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');  
            }
            if (checkRes && checkRes.length > 0) {
                return res.status(500).send("Mobile Number Already Exists.");
              }
             if(cashPermissionForGames.includes(Number(game_id))){
            let userUpdateSql = `UPDATE player_profile SET Mobile = $1, MobileVerifStatus = 0 WHERE OCID = $2;`;
            await sails.getDatastore("master").sendNativeQuery(userUpdateSql, [newMobileNumber, ocid]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateMobileNo",
                        "mobile":newMobileNumber,
                        "ocid":ocid
                    }
                }
              await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            let logText = `Mobile Number Change Change from ${mobileNo} to ${newMobileNumber} for OCID is ${ocid}`;
            if(cashPermissionForGames.includes(Number(game_id))){
            let logSql = `INSERT INTO player_change_log (admin_id,OCID,log_changes,User_state_change) VALUES ($1, $2, $3, $4);`;
            await sails.getDatastore("master").sendNativeQuery(logSql, [adminId,ocid,`Mobile Number Update`, logText]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"insertLog",
                        "adminid":adminId,
                        "ocid":ocid,
                        "logchanges":`Mobile Number Update`,
                        "logtext":logText
                    }
                }
              await socketRequestData(req,reqObj,websocket,game_id,'webstore');   
            }
            let gameAppID;
            if (Array.isArray(selectRes) && selectRes.length > 0 && selectRes[0].GameAPPID) {
                gameAppID = selectRes[0].GameAPPID;
            } else if (selectRes && selectRes.msg && Array.isArray(selectRes.msg) && selectRes.msg.length > 0) {
                gameAppID = selectRes.msg[0].GameAPPID;
            }
            
            let userDataObj = {
                game_id : game_id,
                admin_id : adminId,
                gocid : gocid,
                type : "profile",
                old_obj : { 'Mobile': mobileNo},
                new_obj :  { 'Mobile': newMobileNumber},
                GameAPPID: gameAppID,
            };
            UtilService.addUserQueueAndNotify(userDataObj);
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.mobileUpdate', line: 88, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    emailIdUpdate: async (req, res) => {
        try {
            let { ocid, gocid, EmailID, newEmailID } = req.allParams();
            let selectRes=[];
            let checkRes=[];
            let logSql=[];
            let adminId = req.session.adminUserId;
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if (!ocid || !gocid || !newEmailID) {
                return res.status(500).send("Required params empty.");
            }
            if(cashPermissionForGames.includes(Number(game_id))){

            let selectSql = `SELECT OCID, GameID FROM game_player_master WHERE GOCID = $1;`;
             selectRes = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"checkValidUser",
                        "gocid":gocid
                    }
                }
              await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            if(!selectRes || selectRes.length == 0) {
                return res.status(500).send("Invalid User.");
            }
            if(cashPermissionForGames.includes(Number(game_id))){

            let checkSql = `SELECT 1 FROM player_profile WHERE EmailID = $1;`;
            checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [newEmailID])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"checkForEmailUpdate",
                        "email":newEmailID
                    }
                }
                checkRes= await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            if (checkRes && checkRes.length || checkRes.msg && checkRes.msg.length) return res.status(500).send("EmailID Already Exists.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let userUpdateSql = `UPDATE player_profile SET EmailID = $1, EmailVerifStatus = 0 WHERE OCID = $2;`;
            await sails.getDatastore("master").sendNativeQuery(userUpdateSql, [newEmailID, ocid]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateEmail",
                        "email":newEmailID,
                        "ocid":ocid
                    }
                }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            let logText = `EmailID Change Change from ${EmailID} to ${newEmailID} for OCID is ${ocid}`;
            if(cashPermissionForGames.includes(Number(game_id))){
                 logSql = `INSERT INTO player_change_log (admin_id,OCID,log_changes,User_state_change) VALUES ($1, $2, $3, $4);`;
            await sails.getDatastore("master").sendNativeQuery(logSql, [adminId,ocid,`EmailID Update`, logText]);
            }else{
            let reqObj = {
                "action":"getPanelData",
                "parameters":{
                    "name":"insertLog",
                    "adminid":newMobileNumber,
                    "ocid":ocid,
                    "logchanges":`Mobile Number Update`,
                    "logtext":logText
                }
            }
            logSql=await socketRequestData(req,reqObj,websocket,game_id,'webstore');   

            }
            let userDataObj = {
                game_id : selectRes[0].GameID,
                admin_id : adminId,
                gocid : gocid,
                type : "profile",
                old_obj : { 'EmailID': EmailID},
                new_obj :  { 'EmailID': newEmailID},
            };
            await UtilService.addUserUpdateQueueData(userDataObj);
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.emailIdUpdate', line: 117, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    sendMobileVerifyOtp: async (req, res) => {
        try {
            let Mobile = req.param('Mobile');
            let ocid = req.param('ocid');
            let gocid = req.param('gocid');
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let checkRes=[];
            if (!ocid || !Mobile || !gocid) {
                return res.status(500).send("Required params empty.");
            }
            let otpnum = UtilService.getToken(6);
            let emailTokenExpireTime = sails.config.emailTokenExpire;

            let SysCreationDate = Moment.init(new Date()).format('YYYY-MM-DD HH:mm:ss')
            let expireTime = new Date();
            expireTime = new Date(expireTime.setHours(expireTime.getHours() + Number(emailTokenExpireTime)));
            expireTime = Moment.init(new Date(expireTime)).format('YYYY-MM-DD HH:mm:ss');
            if(cashPermissionForGames.includes(Number(game_id))){
            let checkSql = `SELECT OCID FROM player_profile WHERE OCID = $1 AND MobileVerifStatus = 1;`;
            checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [ocid])).rows;
            }
            else{
                if(typeof ocid !== 'undefined'){
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getMobileVerifyData",
                        "ocid":ocid
                    }
                }
                checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            }
            if (checkRes && checkRes.length || checkRes.msg && checkRes.msg.length) return res.status(500).send("Already Verified.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let otpInsertSql = `INSERT INTO player_otp_verify(OCID,Token,Type,Status,Date,TokenExpiryDateTime) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE OCID = VALUES(OCID), Token = VALUES(Token), Type = VALUES(Type), Status = VALUES(Status), Date = VALUES(Date), TokenExpiryDateTime = VALUES(TokenExpiryDateTime);`;
            await sails.getDatastore("master").sendNativeQuery(otpInsertSql, [ocid, otpnum, 'MOBILEOTP', '1', SysCreationDate, expireTime]);
            }else{
                if(typeof ocid !== 'undefined'){
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"insertOtpLog",
                            "ocid":ocid,
                            "otpnum":otpnum,
                            "type":type,
                            "syscreationdate":SysCreationDate,
                            "expiretime":expireTime
                        }
                    }
                    checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
                }
            }
           
            let variables = [otpnum];
            variables = UtilService.parseTemplateVariables(variables);
            var instant = 1;
            var message = 'Hello,+' + variables[0] + '+One+Time+Password+(OTP)+for+your+Play+Rummy+Mobile+Verification';
            var vendor;
            var sms_template_id = 35;
            await UtilService.sendSms(Mobile, message, vendor, sms_template_id);
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.sendMobileVerifyOtp', line: 124, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    MobileVerifyOtp: async (req, res) => {
        try {
            let verifyOtpNum = req.param('verifyOtpNum');
            let ocid = req.param('ocid');
            let gocid = req.param('gocid');
            let Mobile = req.param('Mobile');
            let checkOptSqlRes=[];
            let checkRes=[];
            if (!ocid || !gocid || !verifyOtpNum) {
                return res.status(500).send("Required params empty.");
            }if(cashPermissionForGames.includes(Number(game_id))){
            let checkSql = `SELECT OCID FROM player_profile WHERE OCID = $1 AND MobileVerifStatus = 1;`;
            checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [ocid])).rows;
            }
            else{
                if(typeof ocid !== 'undefined'){
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getMobileVerifyData",
                        "ocid":ocid
                    }
                }
                checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            }
            if (checkRes && checkRes.length || checkRes.msg && checkRes.msg.length) return res.status(500).send("Already Verified.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let checkOptSql = `SELECT 1 FROM player_otp_verify WHERE OCID = $1 AND Type = $2 AND Token = $3 AND Status = 1 AND TokenExpiryDateTime >= NOW();`;
            checkOptSqlRes = (await sails.getDatastore("slave").sendNativeQuery(checkOptSql, [ocid, 'MOBILEOTP', verifyOtpNum])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"checkOtp",
                        "ocid":ocid,
                        "type":'MOBILEOTP',
                        "verifyotpnum":verifyOtpNum
                    }
                }
                checkOptSqlRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    

            }
            if (!checkOptSqlRes || checkOptSqlRes.length == 0 || !checkOptSqlRes.msg && checkOptSqlRes.msg.length ) return res.status(500).send("OTP Incorrect/Expired.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let updateSql = `UPDATE player_profile SET MobileVerifStatus = 1 WHERE OCID = $1`;
            await sails.getDatastore("master").sendNativeQuery(updateSql, [ocid]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateMobileVerifyStatus",
                        "ocid":ocid,
                    }
                }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }

            if(cashPermissionForGames.includes(Number(game_id))){
            let updateOtpSql = `UPDATE player_otp_verify SET Status = 0 WHERE OCID = $1 AND Type = $2;`;
            await sails.getDatastore("master").sendNativeQuery(updateOtpSql, [ocid, 'MOBILEOTP']);
            }
            else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateOtp",
                        "ocid":ocid,
                        "type":'EMAILOTP'
                    }
                }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.MobileVerifyOtp', line: 158, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    sendEmailVerifyOtp: async (req, res) => {
        try {
            let mailId = req.param('emailId');
            let ocid = req.param('ocid');
            let gocid = req.param('gocid');
            let screenName = req.param('screenName');
            let checkRes =[];
            if (!gocid || !ocid || !mailId) {
                return res.status(500).send("Required params empty.");
            }
            let otpnum = UtilService.getToken(6);
            let emailTokenExpireTime = sails.config.emailTokenExpire;

            let SysCreationDate = Moment.init(new Date()).format('YYYY-MM-DD HH:mm:ss')
            let expireTime = new Date();
            expireTime = new Date(expireTime.setHours(expireTime.getHours() + Number(emailTokenExpireTime)));
            expireTime = Moment.init(new Date(expireTime)).format('YYYY-MM-DD HH:mm:ss');
            if(cashPermissionForGames.includes(Number(game_id))){
            let checkSql = `SELECT OCID FROM player_profile WHERE OCID = $1 AND EmailVerifStatus = 1;`;
            checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [ocid])).rows;
            }else{
                if(typeof ocid !== 'undefined'){
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"getOcidForEmailOtp",
                        "ocid":ocid
                    }
                }
                checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore'); 
            }
            }
            if (checkRes && checkRes.length || checkRes.msg && checkRes.msg.length) return res.status(500).send("Already Verified.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let otpInsertSql = `INSERT INTO player_otp_verify(OCID,Token,Type,Status,Date,TokenExpiryDateTime) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE OCID = VALUES(OCID), Token = VALUES(Token), Type = VALUES(Type), Status = VALUES(Status), Date = VALUES(Date), TokenExpiryDateTime = VALUES(TokenExpiryDateTime);`;
            await sails.getDatastore("master").sendNativeQuery(otpInsertSql, [ocid, otpnum, 'EMAILOTP', '1', SysCreationDate, expireTime]);
            }else{
                if(typeof ocid !== 'undefined'){
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"insertOtpLog",
                            "ocid":ocid,
                            "otpnum":otpnum,
                            "type":type,
                            "syscreationdate":SysCreationDate,
                            "expiretime":expireTime
                        }
                    }
                    checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
                }
            }
            let mailmsg = 'Please find the One Time Password (OTP) for your E-mail Verification below:<br><br> ' +
                'OTP: ' + otpnum + '<br><br>' +
                'OTP Verification verifies Email Address of users by sending verification code(OTP) during registration. This process removes the possibility of a user registering with fake Email Address making your registration secure.<br><br>';
            let subject = 'Email Verification Otp';
            let mailbody = UtilService.frameMailer(mailmsg, screenName);
            var emailInfo = {
                message: mailbody,
                subject: subject,
                fromEmail: sails.config.PokerProEmail,
                fromName: "PlayRummy",
                to: mailId,
                mailType:'SMTP2',
                name: screenName,
                // user_id : userid
            };
            EmailService.simpleSendEmail(emailInfo, () => { });
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.sendEmailVerifyOtp', line: 222, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    EmailVerifyOtp: async (req, res) => {
        try {
            let verifyOtpNum = req.param('verifyOtpNum');
            let ocid = req.param('ocid');
            let gocid = req.param('gocid');
            let checkOptSqlRes=[];
            if (!gocid || !ocid || !verifyOtpNum) {
                return res.status(500).send("Required params empty.");
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let checkOptSql = `SELECT 1 FROM player_otp_verify WHERE OCID = $1 AND Type = $2 AND Token = $3 AND Status = 1 AND TokenExpiryDateTime >= NOW();`;
            checkOptSqlRes = (await sails.getDatastore("slave").sendNativeQuery(checkOptSql, [ocid, 'EMAILOTP', verifyOtpNum])).rows;
            }else{
            let reqObj = {
                "action":"getPanelData",
                "parameters":{
                    "name":"checkOtp",
                    "ocid":ocid,
                    "type":'EMAILOTP',
                    "verifyotpnum":verifyOtpNum
                }
            }
            checkOptSqlRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');    

        }
            checkOptSqlRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');   
            if (!checkOptSqlRes || checkOptSqlRes.length == 0 || !checkOptSqlRes.msg && checkOptSqlRes.msg.length) return res.status(500).send("OTP Incorrect/Expired.");
            if(cashPermissionForGames.includes(Number(game_id))){
            let updateSql = `UPDATE player_profile SET EmailVerifStatus = 1 WHERE OCID = $1`;
            await sails.getDatastore("master").sendNativeQuery(updateSql, [ocid]);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateEmailVerifyStatus",
                        "ocid":ocid,
                    }
                }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
    
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let updateOtpSql = `UPDATE player_otp_verify SET Status = 0 WHERE OCID = $1 AND Type = $2;`;
            await sails.getDatastore("master").sendNativeQuery(updateOtpSql, [ocid, 'EMAILOTP']);
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"updateOtp",
                        "ocid":ocid,
                        "type":'EMAILOTP'
                    }
                }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');    
            }
            return res.status(200).send("1");
        } catch (error) {
            console.error({ error: error, service: 'UserController.EmailVerifyOtp', line: 245, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }
    },

    gameList: async (req, res) => {
        try {
            let gocid = req.param("gocid");
            let data=[];
            let game_name;
             if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let gameSql = ``;
            if(req.session.adminGames) {
              gameSql = ` AND gpm.GameID IN (${req.session.adminGames.map(e => ''+e)}) `
            }       
            if(cashPermissionForGames.includes(Number(game_id))){
            let selectSql = `SELECT gpm.GOCID, gpm.OCID, gpm.GameID, gm.GameName FROM game_player_master gpm JOIN game_master gm ON gm.GameID = gpm.GameID WHERE gpm.OCID IN (SELECT OCID FROM game_player_master WHERE GOCID = $1) ${gameSql}`;
            data = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;
            }
            else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"gameList",
                        "gocid":gocid,
                        "gameSql":gameSql
                    },
                }
                let response= await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                if(typeof response == 'object'){
                    let status=response.Status;
                    if(status==1){
                        data = [...response.msg]
                    }
                }
            }
            data.forEach(element => {
                if (element.GOCID == gocid) game_name = element.GameName;
            });
            return res.view({ list: data, gocid: gocid, game_name: game_name, page_name: "user_registered_games" })
        } catch (error) {
            console.error({ error: error, service: 'UserController.gameList', line: 270, error_at: Moment.getTimeForLogs() });
            return res.redirect('/');
        }
    },

    ledger: async (req, res) => {
        try {
            let tranx_map = {};
            let walletLabels=[];
            let data =[];
            let gameName;
            let existingValues ={};
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if (req.method == 'GET') {
                let gocid = req.param("gocid");
                if (!gocid){
                    req.session.msg = "Please select a user";
                    return res.redirect('/admin/searchUserProfile');
                }
                if(cashPermissionForGames.includes(Number(game_id))){
                let selectTransactionType =  `SELECT gs.Value as transaction from game_settings gs JOIN game_player_master gpm ON gs.GameID=gpm.GameID WHERE gpm.GOCID= $1 and Setting='LEDGER_TRANSACTION_TYPE';`
                let TransactionType = (await sails.getDatastore("slave").sendNativeQuery(selectTransactionType, [gocid])).rows[0];
                tranx_map = JSON.parse(TransactionType.transaction);

                let selectQuery = `select Wallet,tag from system_wallet_tag swg join wallet_tag_mapping map on swg.TagID = map.TagID where TagType='system' and GameID=(SELECT GameId from game_player_master where GOCID=$1)`;
                let walletData = (await sails.getDatastore("slave").sendNativeQuery(selectQuery, [gocid])).rows;
                for( wallet in walletData){
                    walletLabels[walletData[wallet]['Wallet']] = walletData[wallet]['tag'];
                }
                let todayDate = Moment.init(new Date()).format('YYYY-MM-DD');
             
                let ledgerQuery = `Select lg.LedgerId, CONCAT(lg.SysCreationDate, ' ' ,lg.SysCreationTime) AS SysCreationDate, lg.TransactionType, lg.Amount/cm.CurrencyDisplayUnit AS Amount, lg.WalletID, lg.InitialBalance, lg.ClosingBalance, lg.TransactionID, guw.WalletLabel, guw.GOCID, cm.CurrencyLabel FROM ledger lg JOIN game_user_wallet guw ON guw.WalletID = lg.WalletID JOIN wallet_master wm ON guw.WalletID = wm.WalletID JOIN currency_master cm on wm.CurrencyID = cm.CurrencyID WHERE guw.GOCID = $1 and lg.SysCreationDate = $2 ORDER BY LedgerId DESC`;
                data = (await sails.getDatastore("slave").sendNativeQuery(ledgerQuery, [gocid, todayDate])).rows;
                let gameNameQuery = `Select gm.GameName, gpm.GameID from game_player_master gpm inner join  game_master gm on gpm.GameID = gm.GameID  where gpm.GOCID = $1`;
                let gameNameData = (await sails.getDatastore("slave").sendNativeQuery(gameNameQuery, [gocid])).rows;
                gameName = gameNameData[0].GameName;
                let getWalletLabel = await UtilService.getGameMasterInfo(gameNameData[0].GameID);
                for(let i in data){
                    data[i].WalletLabel = getWalletLabel.walletLabel[data[i].WalletLabel];
                }
                existingValues = {
                    fromDate: todayDate,
                    toDate: todayDate,
                    balanceType: ''
                }
                if (data && data.length == 0) {
                    return res.view({gocid, gameName, existingValues, ledgerList: null, page_name: 'ledger',walletLabels:null,tranx_map:tranx_map, USER_TRANX_TYPES_NEG:sails.config.Constant.USER_TRANX_TYPES_NEG });
                } else if (data && data.length > 0) {
                    return res.view({gocid, gameName, existingValues, ledgerList: data, page_name: 'ledger', walletLabels:walletLabels,tranx_map:tranx_map, USER_TRANX_TYPES_NEG:sails.config.Constant.USER_TRANX_TYPES_NEG });
                }
            }

            } else if (req.method == 'POST') {
                let gocid = req.param('gocid');
                let fromDate = req.param('fromDate');
                let toDate = req.param('toDate');
                if (!gocid){
                    req.session.msg = "Please select a user";
                    return res.redirect('/admin/searchUserProfile');
                    // return res.redirect("/admin/admindashboard");
                }
                if(cashPermissionForGames.includes(Number(game_id))){
                let gameNameQuery = `Select gm.GameName, gpm.GameID from game_player_master gpm inner join  game_master gm on gpm.GameID = gm.GameID where gpm.GOCID = $1`;
                let gameNameData = (await sails.getDatastore("slave").sendNativeQuery(gameNameQuery, [gocid])).rows;
                if(gameNameData.length==0) {
                    return res.redirect('/');
                }
                if(typeof gameNameData[0].GameID != 'undefined' && gameNameData[0].GameID != game_id){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
                }
                gameName = gameNameData[0].GameName;
                
                let getWalletLabel = await UtilService.getGameMasterInfo(gameNameData[0].GameID);
                let selectTransactionType =  `SELECT gs.Value as transaction from game_settings gs JOIN game_player_master gpm ON gs.GameID=gpm.GameID WHERE gpm.GOCID= $1 and Setting='LEDGER_TRANSACTION_TYPE';`
                let TransactionType = (await sails.getDatastore("slave").sendNativeQuery(selectTransactionType, [gocid])).rows[0];
                tranx_map = JSON.parse(TransactionType.transaction);
                
                let selectQuery = `select Wallet,tag from system_wallet_tag swg join wallet_tag_mapping map on swg.TagID = map.TagID where TagType='system' and GameID=(SELECT GameId from game_player_master where GOCID=$1)`;
                let walletData = (await sails.getDatastore("slave").sendNativeQuery(selectQuery, [gocid])).rows;
                walletLabels=[];
                for( wallet in walletData){
                    walletLabels[walletData[wallet]['Wallet']] = walletData[wallet]['tag'];
                }
     
                if (!fromDate || !toDate) {
                    req.session.msg = 'Please enter date range.';
                    return res.redirect('/user/ledger?gocid=' + gocid);
                }

                let { balanceType } = req.body || req.query; 
                let balanceTypeCondition = '';

                if (balanceType && balanceType !== 'All') {
                    balanceTypeCondition = `AND lg.TransactionType = '${balanceType}'`;
                }

                let ledgerQuery = `SELECT lg.LedgerId, CONCAT(lg.SysCreationDate, ' ', lg.SysCreationTime) AS SysCreationDate, lg.TransactionType, lg.Amount/cm.CurrencyDisplayUnit AS Amount, lg.WalletID, lg.InitialBalance/cm.CurrencyDisplayUnit AS InitialBalance, lg.ClosingBalance/cm.CurrencyDisplayUnit AS ClosingBalance, lg.TransactionID, guw.WalletLabel, guw.GOCID, cm.CurrencyLabel FROM ledger lg JOIN game_user_wallet guw ON guw.WalletID = lg.WalletID JOIN wallet_master wm ON guw.WalletID = wm.WalletID JOIN currency_master cm ON wm.CurrencyID = cm.CurrencyID WHERE guw.GOCID = $1 AND lg.SysCreationDate BETWEEN $2 AND $3 ${balanceTypeCondition} ORDER BY LedgerId DESC`;

                let existingValues = {
                    fromDate: fromDate,
                    toDate: toDate,
                    balanceType: balanceType
                }
                let data = (await sails.getDatastore("slave").sendNativeQuery(ledgerQuery, [gocid, fromDate, toDate])).rows;
                for(let i in data){
                    data[i].WalletLabel = getWalletLabel.walletLabel[data[i].WalletLabel];
                }

                if (data && data.length == 0) {
                    req.session.msg = 'No Ledger data found';
                    res.view({gocid, gameName, existingValues, ledgerList: data, page_name: 'ledger',walletLabels:null, tranx_map:tranx_map, USER_TRANX_TYPES_NEG:sails.config.Constant.USER_TRANX_TYPES_NEG });
                } else {
                    res.view({gocid, gameName, existingValues, ledgerList: data, page_name: 'ledger', walletLabels:walletLabels, tranx_map:tranx_map, USER_TRANX_TYPES_NEG:sails.config.Constant.USER_TRANX_TYPES_NEG });
                }
                }
            }
        } catch (error) {
            console.error({ error: error, service: 'UserController.ledger', line: 72, error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    deposit: async (req, res) => {
        try {
            const gocid = req.param('gocid');
            let totalDepositBalance =[];
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            const filter = req.param('filter') || '';
            let currentMonth = new Date().getMonth();
            let currentYear = new Date().getFullYear();
            let financialYearStart = typeof sails.config.financialYearStart != 'undefined' ? sails.config.financialYearStart : currentYear;
            fromDate = toDate = 0;

            if(filter && filter == 'All'){
                fromDate = (financialYearStart) ? `${ financialYearStart}-04-01`: '';
                toDate = (currentYear) ? `${ currentYear + 1}-03-31`: '';
            } else if(filter && filter != 'All'){
                let dateLimit = filter.split("-");
                fromDate = (dateLimit && dateLimit[0]) ? `${ dateLimit[0] }-04-01`: '';
                toDate = (dateLimit && dateLimit[1]) ? `${ dateLimit[1] }-03-31`: '';
            } else if(!filter || filter == ''){
                if(currentMonth > 3){
                    fromDate = (currentYear) ? `${ currentYear }-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear + 1 }-03-31`: '';
                } else {
                    fromDate = (currentYear) ? `${ currentYear - 1}-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear }-03-31`: '';
                }
            }
            let totalRecord =[];
            let currentPage = req.param('page') || 1;
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            
            let totalCountSql = `SELECT COUNT(1) as count, ROUND(sum(IF(PGStatus="success",db.DepositBalance,0))/100,2) as DepositBalance FROM deposit_balance db JOIN game_user_wallet guw ON db.WalletID = guw.WalletID WHERE guw.GOCID =  $1 AND SysCreationDate >= $2 AND SysCreationDate <= $3`;

            let totalCountRes = (await sails.getDatastore("slave").sendNativeQuery(totalCountSql, [gocid, fromDate, toDate])).rows;
            totalRecord = totalCountRes && totalCountRes.length ? totalCountRes[0].count : 0;
            totalDepositBalance = totalCountRes && totalCountRes.length ? totalCountRes[0].DepositBalance : 0;


            var queryForDeposit = `SELECT db.TransactionID, db.PGTransactionID, CONCAT(db.SysCreationDate, ' ' ,db.SysCreationTime) AS SysCreationDate, db.PGSource, guw.WalletLabel, guw.GOCID, if(db.DepositBalance>0,db.DepositBalance/100,0) as TotalDeposit, if(db.GstAsPromo>0,db.GstAsPromo/100,0) as GstRakeBack, if(db.GstAsPromo>0,(floor((db.DepositBalance)/1.28)/100),db.DepositBalance/100) as UserWallet, db.PGStatus, db.Message,  db.RecLuDate, db.Source FROM deposit_balance db JOIN game_user_wallet guw ON db.WalletID = guw.WalletID WHERE guw.GOCID =  $1 AND SysCreationDate >= $2 AND SysCreationDate <= $3 ORDER BY SysCreationDate DESC, SysCreationTime DESC`;

            var depositData = (await sails.getDatastore('slave').sendNativeQuery(queryForDeposit, [gocid, fromDate, toDate])).rows;
            }
            res.view({
                data: depositData,
                gocid: gocid,
                fromDate: fromDate,
                toDate: toDate,
                currentMonth: currentMonth,
                currentYear: currentYear,
                filter:filter,
                financialYearStart:financialYearStart,
                totalRecord:totalRecord,
                totalDepositBalance:totalDepositBalance
            });
        } catch (error) {
            console.error({ error: error, service: 'UserController.deposit', line: 386, error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    withdraw: async (req, res) => {
        try {
            let gocid = req.param('gocid');
            let gameSettingCurrency=[];
            let totalAmountWithdrawn=[];
            let bankDetails=[];
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            const filter = req.param('filter') || '';
            let currentMonth = new Date().getMonth();
            let currentYear = new Date().getFullYear();
            let financialYearStart = typeof sails.config.financialYearStart != 'undefined' ? sails.config.financialYearStart : currentYear;
            fromDate = toDate = 0;

            if(filter && filter == 'All'){
                fromDate = (financialYearStart) ? `${ financialYearStart}-04-01`: '';
                toDate = (currentYear) ? `${ currentYear + 1}-03-31`: '';
            }
            else if(filter && filter != 'All'){
                let dateLimit = filter.split("-");
                fromDate = (dateLimit && dateLimit[0]) ? `${ dateLimit[0] }-04-01`: '';
                toDate = (dateLimit && dateLimit[1]) ? `${ dateLimit[1] }-03-31`: '';
            } else if(!filter || filter == ''){
                if(currentMonth > 3){
                    fromDate = (currentYear) ? `${ currentYear }-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear + 1 }-03-31`: '';
                } else {
                    fromDate = (currentYear) ? `${ currentYear - 1}-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear }-03-31`: '';
                }
            }
            let totalCountRes=[];
            let totalRecord = totalCountRes && totalCountRes.length ? totalCountRes[0].count : 0;
            if(cashPermissionForGames.includes(Number(game_id))){
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            getGameId = getGameId[0].GameID;
            let gameSetting = await UtilService.getGameSettingFromCache(getGameId);
            gameSettingCurrency = gameSetting['Game_Currency'];

          
            let totalCountSql = `SELECT COUNT(1) as count, ROUND(sum(IF(Status!="rejected",wb.AmountWithdrawn,0))/100,2) as AmountWithdrawn FROM withdraw_balance wb JOIN game_user_wallet guw ON wb.WalletID = guw.WalletID WHERE guw.GOCID =  $1 AND wb.SysCreationDate >= $2 AND wb.SysCreationDate <= $3  `;

            totalCountRes = (await sails.getDatastore("slave").sendNativeQuery(totalCountSql, [gocid, fromDate, toDate])).rows;
            totalAmountWithdrawn = totalCountRes && totalCountRes.length ? totalCountRes[0].AmountWithdrawn : 0;

            var queryForWithdrawal = `SELECT wb.TransactionID, wb.SysCreationDate,  wb.SysCreationTime, wb.WithdrawApiRes, guw.GOCID, guw.WalletLabel, wb.WinningBalance, wb.AmountWithdrawn, wb.WithdrawalCharge, wb.Status, wb.VerifierID, wb.VerifiedFlag, wb.VerifierID2, wb.VerifiedFlag2, wb.VerifierTxt2, wb.CompletedOn, wb.BankName, wb.AccNo,wb.AccHldName,wb.IFSCCode, wb.withdraw_bank_source, ad1.username as verifier1_name, ad2.username as verifier2_name FROM withdraw_balance wb JOIN game_user_wallet guw ON wb.WalletID = guw.WalletID LEFT JOIN acl_admins ad1 ON ad1.admin_id = wb.VerifierID LEFT JOIN acl_admins ad2 ON ad2.admin_id = wb.VerifierID2 WHERE guw.GOCID =  $1 AND wb.SysCreationDate >= $2 AND wb.SysCreationDate <= $3`;
            var withdrawalData = (await sails.getDatastore('slave').sendNativeQuery(queryForWithdrawal, [gocid, fromDate, toDate])).rows;
            let getBankDetail = `SELECT pbd.BankName, pbd.AccHldName, pbd.IFSCCode, pbd.AccNo, pbd.BankVerifStatus AS BankStatus FROM player_bank_detail pbd JOIN game_player_master gpm ON gpm.BankID = pbd.BankID WHERE gpm.GOCID = $1`;
            bankDetails = (await sails.getDatastore('slave').sendNativeQuery(getBankDetail,[gocid])).rows[0];
            }
            res.view({
                data: withdrawalData,
                gocid: gocid,
                fromDate: fromDate,
                toDate: toDate,
                gameSettingCurrency: gameSettingCurrency,
                bankDetails: bankDetails,
                currentMonth: currentMonth,
                currentYear: currentYear,
                filter:filter,
                financialYearStart:financialYearStart,
                totalRecord:totalRecord,
                totalAmountWithdrawn:totalAmountWithdrawn
            });
        } catch (error) {
            console.error({ error: error, service: 'UserController.withdraw', line: 431, error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    tds: async (req, res) => {
        try {
            let gocid = req.param('gocid');
            let totalTDSAmount=[];
            let totalRecord=[];
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            const filter = req.param('filter') || '';
            let currentMonth = new Date().getMonth();
            let currentYear = new Date().getFullYear();
            let financialYearStart = typeof sails.config.financialYearStart != 'undefined' ? sails.config.financialYearStart : currentYear;
            fromDate = toDate = 0;
            if(filter && filter == 'All'){
                fromDate = (financialYearStart) ? `${ financialYearStart}-04-01`: '';
                toDate = (currentYear) ? `${ currentYear + 1}-03-31`: '';
            }
            else if(filter && filter != 'All'){
                let dateLimit = filter.split("-");
                fromDate = (dateLimit && dateLimit[0]) ? `${ dateLimit[0] }-04-01`: '';
                toDate = (dateLimit && dateLimit[1]) ? `${ dateLimit[1] }-03-31`: '';
            } else if(!filter || filter == ''){
                if(currentMonth > 3){
                    fromDate = (currentYear) ? `${ currentYear }-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear + 1 }-03-31`: '';
                } else {
                    fromDate = (currentYear) ? `${ currentYear - 1}-04-01`: '';
                    toDate = (currentYear) ? `${ currentYear }-03-31`: '';
                }
            }
            let getGameIdQuery = "SELECT GameID, KYCID FROM game_player_master WHERE GOCID = $1";
            let getGameData = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;

            if(getGameData.length==0) {
                return res.redirect('/');
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            var kycid = getGameData[0].KYCID;
            var getGameId = getGameData[0].GameID;
            let gameSetting = await UtilService.getGameSettingFromCache(getGameId);
            let gameSettingCurrency = gameSetting['Game_Currency'];
            
            if(typeof getGameData[0] != 'undefined' && getGameData[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';  
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }

            if(cashPermissionForGames.includes(Number(game_id))){
            let totalCountSql = `SELECT COUNT(*) as count, ROUND(sum(IF(c.Status!="rejected",c.TDSAmount,0))/100,2) as TDSAmount FROM game_user_wallet as a JOIN withdraw_balance b ON a.WalletID = b.WalletID JOIN tds_ledger c ON b.TransactionID = c.TransactionID WHERE a.GOCID = $1 AND DATE(c.SysCreationDate) >= $2 AND DATE(c.SysCreationDate) <= $3`;
            let totalCountRes = (await sails.getDatastore("slave").sendNativeQuery(totalCountSql, [gocid, fromDate, toDate ])).rows;
            totalRecord = totalCountRes && totalCountRes.length ? totalCountRes[0].count : 0;
            totalTDSAmount = totalCountRes && totalCountRes.length ? totalCountRes[0].TDSAmount : 0;

            var queryForTds = `SELECT c.TransactionID,c.TDSAmount,c.WithdrawAmount,c.UserRequestedAmount,c.TDSDepositDate,c.Status,c.TDSCertiPath,c.SysCreationDate from game_user_wallet as a LEFT JOIN withdraw_balance b ON a.WalletID = b.WalletID LEFT JOIN tds_ledger c ON b.TransactionID = c.TransactionID WHERE a.GOCID = $1 and DATE(c.SysCreationDate) >= $2 AND DATE(c.SysCreationDate) <= $3`;
            var tdsData = (await sails.getDatastore('slave').sendNativeQuery(queryForTds, [gocid, fromDate, toDate])).rows;
            }
            res.view({
                data: tdsData,
                gocid: gocid,
                fromDate: fromDate,
                toDate: toDate,
                gameSettingCurrency: gameSettingCurrency,
                currentMonth: currentMonth,
                currentYear: currentYear,
                filter:filter,
                financialYearStart:financialYearStart,
                totalRecord:totalRecord,
                totalTDSAmount:totalTDSAmount
            });
        } catch (error) {
            console.error({ error: error, service: 'UserController.tds', line: 431, error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },
    updateUserBank: async function(req,res) {
        try {
            const gocid = req.param('gocid');
            const txnId = req.param('txnId');
            const txnStatus = req.param('txnstatus').toLowerCase();
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(txnStatus != 'pending'){
                return res.status(500).send('Updation Failed, Withdraw Status is Not Pending!!!');
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let getBankDetail = `SELECT pbd.BankName, pbd.AccHldName, pbd.IFSCCode, pbd.AccNo, pbd.BankVerifStatus AS BankStatus FROM player_bank_detail pbd JOIN game_player_master gpm ON gpm.BankID = pbd.BankID WHERE gpm.GOCID = $1`;
            let bankDetails = (await sails.getDatastore('slave').sendNativeQuery(getBankDetail,[gocid])).rows[0];

            if(bankDetails && bankDetails.BankStatus == 1){
                let updateSql = `UPDATE withdraw_balance SET BankName = $1,AccHldName = $2,IFSCCode = $3,AccNo = $4 WHERE TransactionID = $5 and status="pending"`;
                let update = (await sails.getDatastore('master').sendNativeQuery(updateSql,[bankDetails.BankName, bankDetails.AccHldName, bankDetails.IFSCCode, bankDetails.AccNo, txnId]));

                if(update.changedRows){
                    req.session.msg = 'Bank Details Updated Succesfully !!!';
                    return res.status(200).send();
                } else {
                    return res.status(500).send('Bank Updation Failed !!!');
                }
            } else {
                return res.status(500).send('Bank Details Not Found !!!')
            }
        }
        } catch(error){
            console.error({ error : error, service: 'UserController.updateUserBank', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':',''), error_at : Moment.getTimeForLogs() });
        }
    },
    blockUser: async (req, res) => {
        try {
            let comment = req.param('comment');
            let ocid = req.param('ocid');
            let gocid = req.param('gocid');      
            let actionTobePerformed = req.param('actionToPerform');
            //let withRevertWithdraw = req.param('withdrawRevertChqbox');
            let reject_Reason = req.param("rejectReason");            
            let screenName = req.param("screenName");
            let gameName = req.param("gameName");
            let gameId = req.param("gameId");
            let expiryTtl = (Math.round(Date.now() / 1000)) + (365 * 24 * 60 * 60);         
            let timestamp = new Date().getTime();
            let created_at = Moment.init(new Date()).format('YYYY-MM-DD HH:mm:ss');
            let blockUserList = sails.config.blockUserList;  
            let isBlockUserInfoInDynamoDB =  sails.config.isBlockUserInfoInDynamoDB; 
            if ( !ocid || !gocid ) {
                return res.status(500).send("Required params empty.");
            }  
            let adminId = req.session.adminUserId;   
            let selectRes=[];       
            //let noOfDaysBlocked = req.param("noOfDaysBlocked");            
            //let noOfDaysBlocked = 2;            
            // if (statusFlag == 0) {
            //     return res.status(500).send("Something went wrong.. Please try again later..");
            // }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let selectSql = `SELECT gpm.OCID, gpm.GameID, gm.GameAPPID FROM game_player_master gpm JOIN game_master gm ON gpm.GameID = gm.GameID WHERE GOCID = $1;`;
            selectRes = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [gocid])).rows;    
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"profileFieldUpdataData",
                        "gocid":gocid,
                    },
                }
                selectRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');
            }
        if (actionTobePerformed == 'Unblock') { 
            let checkRes=[];        
            if(cashPermissionForGames.includes(Number(game_id))){       
                let checkSql = `SELECT 1 FROM player_profile WHERE OCID = $1`;
                 checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [ocid])).rows;
            }else{
                let reqObj = {
                    "action":"getPanelData",
                    "parameters":{
                        "name":"checkOcid",
                        "ocid":ocid,
                    },
                }
                checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');
            }
                if (checkRes.length < 1 ) return res.status(500).send("No data found.");
                if(cashPermissionForGames.includes(Number(game_id))){       
                let updateSql = `UPDATE game_player_master SET Status = 0 WHERE GOCID = $1`;
                await sails.getDatastore("master").sendNativeQuery(updateSql, [gocid]);
                }else{
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"updateGocidFor0",
                            "gocid":gocid,
                        },
                    }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                }
                let gameAppID;
                let gameId;
                if (Array.isArray(selectRes) && selectRes.length > 0 && selectRes[0].GameAPPID && selectRes[0].GameID) {
                    gameAppID = selectRes[0].GameAPPID;
                    gameId = selectRes[0].GameID;
                } else if (selectRes && selectRes.msg && Array.isArray(selectRes.msg) && selectRes.msg.length > 0) {
                    gameAppID = selectRes.msg[0].GameAPPID;
                    gameId = selectRes.msg[0].GameID;

                }
                let userDataObj = {
                    game_id : gameId,
                    GameAPPID: gameAppID,
                    admin_id : adminId,
                    gocid : gocid,
                    type : "profile",
                    old_obj : { 'UserBlock': "Block"},
                    new_obj :  { 'UserBlock': "UnBlock"},
                };
                await UtilService.addUserQueueAndNotify(userDataObj);  
                if(isBlockUserInfoInDynamoDB == 1){
                    let itemsData = {
                        'playerId': timestamp+'-'+ocid,
                        'gocID': gocid,
                        'comment': comment,
                        'reason': blockUserList[reject_Reason],
                        'ScreenName': screenName,
                        'actionTobePerformed': actionTobePerformed,
                        'CreatedAt': created_at,
                        'actionByadminID': adminId,
                        'gameName': gameName,
                        "ttl": expiryTtl,
                    }
                   await AwsService.putDataInDynamoDB('user_block_log', itemsData);       
                }         
                return res.status(200).send("1");
            }else{
                let checkRes=[];        
                if(cashPermissionForGames.includes(Number(game_id))){       
                    let checkSql = `SELECT 1 FROM player_profile WHERE OCID = $1`;
                    checkRes = (await sails.getDatastore("slave").sendNativeQuery(checkSql, [ocid])).rows;
                }else{
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"checkOcid",
                            "ocid":ocid,
                        },
                    }
                    checkRes = await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                }
                if(checkRes.length<1) return res.status(500).send("No data found.");
                if(cashPermissionForGames.includes(Number(game_id))){       
                let updateSql = `UPDATE game_player_master SET Status = 2 WHERE GOCID = $1`;                   
                await sails.getDatastore("master").sendNativeQuery(updateSql,[gocid]);
                }else{
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"updateGocidFor2",
                            "gocid":gocid,
                        },
                    }
                 await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                }
                let gameAppID;
                let gameId;
                if (Array.isArray(selectRes) && selectRes.length > 0 && selectRes[0].GameAPPID && selectRes[0].GameID) {
                    gameAppID = selectRes[0].GameAPPID;
                    gameId = selectRes[0].GameID;
                } else if (selectRes && selectRes.msg && Array.isArray(selectRes.msg) && selectRes.msg.length > 0) {
                    gameAppID = selectRes.msg[0].GameAPPID;
                    gameId = selectRes.msg[0].GameID;

                }
                let userDataObj = {
                    game_id : gameId,
                    GameAPPID: gameAppID,
                    admin_id : adminId,
                    gocid : gocid,
                    type : "profile",
                    old_obj : { 'UserBlock': "UnBlock"},
                    new_obj :  { 'UserBlock': "Block"},
                };
                await UtilService.addUserQueueAndNotify(userDataObj);   
                if(isBlockUserInfoInDynamoDB == 1){          
                    let itemsData = {
                        'playerId': timestamp+'-'+ocid,
                        'gocID': gocid,
                        'comment': comment,
                        'reason': blockUserList[reject_Reason],
                        'ScreenName': screenName,
                        'actionTobePerformed': actionTobePerformed,
                        'CreatedAt': created_at,
                        'actionByadminID': adminId,
                        'gameName': gameName,
                        "ttl": expiryTtl,
                    }
                   await AwsService.putDataInDynamoDB('user_block_log', itemsData);
                }
                return res.status(200).send("1");
            }
        } catch (error) {
            console.error({ error: error, service: 'UserController.blockUser', line: 495, error_at: Moment.getTimeForLogs() });
            return res.status(500).send("Something went wrong.. Please try again later..");
        }

    },

    tagUser: async function (req, res) {
        try {
            if (req.session.loginType == 'gplus') {
                let taggedData=[];
                let currentGameId;
                let data=[];
                let masterData=[];
                let adminId = req.session.adminUserId;
                let gocid = req.param('gocid');
                if (!gocid){
                    req.session.msg = "Please select a user";
                    return res.redirect('/admin/searchUserProfile');
                }
                let game_id = req.session.AdminCurrentGame;
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
                }
                var getgameinfoQuery = `SELECT Value FROM game_settings WHERE GameID = ${game_id} AND Setting='Game_Region'`;
                let gameinfo = (await sails.getDatastore("slave").sendNativeQuery(getgameinfoQuery)).rows;
                let region = gameinfo[0];
                if (typeof websocket == 'object') {
                    websocket = (websocket.hasOwnProperty(region)) ? websocket[region].EndPoint : websocket['ap-south-1'].EndPoint;
                }
                let game_region= gameinfo.length > 0 ? gameinfo[0].Value : '';
                if (typeof game_region === 'undefined' || !game_region || game_region.toLowerCase() == 'hurricane') {
                    game_region = 'ap-south-1';
                }                    
                if (game_region != 'ap-south-1' || cashPermissionForGames.includes(Number(game_id))) {    
                    let tagUserQuery = `SELECT u.*,m.Name,m.Withdrawal_block,u.tag_id,ad.username FROM tag_user u JOIN tag_master m ON u.tag_id=m.id LEFT JOIN acl_admins ad ON u.admin_id=ad.admin_id WHERE u.gocid= $1 and u.status=$2 and m.status=$3`;
                    taggedData = (await sails.getDatastore("slave").sendNativeQuery(tagUserQuery, [gocid, 1, 1])).rows;
                } else {
                        let reqObj = {
                            action: "getPanelData",
                            parameters: {
                                name: "getTagUserQuery",
                                gocid: gocid,
                            },
                        };
                        response = await socketRequestData(req, reqObj, websocket, game_id, 'webstore');
                        if (typeof response === 'object' && response.Status === 1) {
                            taggedData = [...response.msg];
                        }
                }          
                if(cashPermissionForGames.includes(Number(game_id))){       
                let currentGameIdQuery = `SELECT GameID FROM game_player_master WHERE gocid=$1`;
                currentGameId = (await sails.getDatastore("slave").sendNativeQuery(currentGameIdQuery, [gocid])).rows;
                }else{
                    let reqObj = {
                        "action":"getPanelData",
                        "parameters":{
                            "name":"getGameIdforGocid",
                            "gocid":gocid,
                        },
                    }
                    let response= await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                    if(typeof response == 'object'){
                        let status=response.Status;
                        if(status==1){
                            currentGameId = [...response.msg]
                        }
                    }
                }
                if((typeof currentGameId == 'undefined') || (typeof currentGameId != 'undefined' && typeof currentGameId[0].GameID != 'undefined'&& currentGameId[0].GameID !=  game_id)){
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
                }

                if (req.method == 'GET') { 
                        let tagMasterList = null;
                        let tagUserList = null;
                        let gameIdForSql = [];
                        if(cashPermissionForGames.includes(Number(game_id))){       
                        let gameIdQuery = `SELECT id,GameID FROM tag_master`;
                        data = (await sails.getDatastore("slave").sendNativeQuery(gameIdQuery, [])).rows;
                        }else{
                            let reqObj = {
                                "action":"getPanelData",
                                "parameters":{
                                    "name":"getGameIdforTag",
                                },
                            }
                            let response= await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                            if(typeof response == 'object'){
                                let status=response.Status;
                                if(status==1){
                                    data = [...response.msg]
                                }
                            }
                        }

                        for (let i = 0; i < data.length; i++) {
                            data[i].GameID = data[i].GameID.split(',');
                            for (let j = 0; j < data[i].GameID.length; j++) {
                                data[i].GameID[j] = Number(data[i].GameID[j]);
                                if (data[i].GameID[j] == currentGameId[0].GameID || data[i].GameID[j] == 0) {
                                    gameIdForSql.push(data[i].id);

                                }
                            }
                        }

                        if(gameIdForSql.length == 0){
                            res.view({
                                gocid: gocid,
                                tagMasterList: tagMasterList,
                                tagUserList: tagUserList,
                                cashPermissionForGames: cashPermissionForGames.includes(Number(game_id))
                            })
                        }else{
                            if(cashPermissionForGames.includes(Number(game_id))){       
                            let tagMasterQuery = `SELECT id,Name from tag_master where status = $1 and id in ($2)`;
                             masterData = (await sails.getDatastore("slave").sendNativeQuery(tagMasterQuery, [1, gameIdForSql]));
                            }else{
                                let reqObj = {
                                    "action":"getPanelData",
                                    "parameters":{
                                        "name":"tagMasterQuery",
                                        "gameidforsql":gameIdForSql
                                    },
                                }
                                let response= await socketRequestData(req,reqObj,websocket,game_id,'webstore');
                                if(typeof response == 'object'){
                                    let status=response.Status;
                                    if(status==1){
                                        masterData = [...response.msg]
                                    }
                                }
                            }

                            if ((Array.isArray(masterData) && masterData.length > 0) || (masterData.rows && masterData.rows.length > 0)) {
                                tagMasterList = Array.isArray(masterData) ? masterData : masterData.rows;                   
                                tagMasterList = masterData;
                                if ((taggedData.rows && taggedData.rows.length > 0) || ((Array.isArray(taggedData) && taggedData.length > 0))) {
                                    tagUserList = Array.isArray(taggedData) ? taggedData : taggedData.rows;                   
                                    tagUserList = taggedData;
                                    res.view({
                                        gocid: gocid,
                                        tagMasterList: tagMasterList.rows || tagMasterList,
                                        tagUserList: tagUserList.rows || tagUserList,
                                        cashPermissionForGames: cashPermissionForGames.includes(Number(game_id))
                                    })
                                }
                                else {
                                    res.view({
                                        gocid: gocid,
                                        tagMasterList: tagMasterList.rows || tagMasterList,
                                        tagUserList: tagUserList,
                                        cashPermissionForGames: cashPermissionForGames.includes(Number(game_id))
                                    })
                                }
                            }
                            else {
                                res.view({
                                    gocid: gocid,
                                    tagMasterList: tagMasterList,
                                    tagUserList: tagUserList,
                                    cashPermissionForGames: cashPermissionForGames.includes(Number(game_id))
                                })
                            }
                        }
                }

                else if (req.method == 'POST') {
                    let tagId = req.param("addtag");
                    let gocid = req.param("gocid");
                    let comments = req.param("comments");
                    let type = req.param('type');
                    let id = req.param('id');
                    let status = 1;
                    if (type == 'remove') {
                        status = 0;
                    }
                   
                    let insertquery = `INSERT INTO tag_user(admin_id,gocid,tag_id,comment,status) VALUES ($1,$2,$3,$4,$5) 
                    ON DUPLICATE KEY UPDATE admin_id= Values(admin_id), comment=Values(comment), status=Values(status)`;
                    let insert = (await sails.getDatastore("master").sendNativeQuery(insertquery, [adminId, gocid, tagId, comments, status]));

                    if (insert.affectedRows > 0) {
                        let tags = taggedData.rows || '';
                        let oldTagNames = '';
                        let newTagNames = '';

                        for (let i in tags) {
                            if (type == 'remove' && tags[i].tag_id == tagId) {
                                oldTagNames += tags[i].Name;
                                if (i < tags.length - 1) oldTagNames += ',';
                            } else {
                                oldTagNames += tags[i].Name;
                                newTagNames += tags[i].Name;
                                if (i < tags.length - 1) {
                                    oldTagNames += ',';
                                    newTagNames += ','
                                }
                            }
                        }

                        if (type == 'add') {
                            let newTagSql = `SELECT Name FROM tag_master WHERE id = $1`;
                            let newTag = (await sails.getDatastore("slave").sendNativeQuery(newTagSql, [tagId])).rows[0].Name;
                            if (newTagNames.length) newTagNames += ',';
                            newTagNames += newTag;
                        }

                        let dataSql = `SELECT GameAPPID,SystemUserGOCID FROM game_master WHERE GameID = $1`;
                        let data = (await sails.getDatastore("slave").sendNativeQuery(dataSql, [currentGameId[0].GameID])).rows[0];

                        let userDataObj = {
                            game_id: currentGameId[0].GameID,
                            admin_id: adminId,
                            gocid: gocid,
                            type: "profile",
                            old_obj: {Tags: oldTagNames},
                            new_obj: {Tags: newTagNames},
                            GameAPPID: data.GameAPPID,
                        };

                        UtilService.addUserQueueAndNotify(userDataObj);

                        let dataDynamoDB = {
                            'gocid': { S: String(gocid) },
                            'tag_id': { S: String(tagId +'-'+Math.round(Date.now()).toString()) },
                            'admin_id': { S: String(adminId) },
                            'comment': { S: comments },
                            'status': { S: String(status) },
                            'RecAddDate': { S: Moment.init(new Date()).format('YYYY-MM-DD HH:mm:ss') },
                            'ttl' : { N: ((Math.round(Date.now() / 1000)) + (90 * 24 * 60 * 60)).toString()},                
                        }
                        putOneItemInDynamo('user_tag_log',dataDynamoDB);

                        if (type == 'remove') {
                            req.session.msg = "Tag Removed Successfully";
                            res.status(200).send("");
                        } else {
                            req.session.msg = 'Tag Added Successfully';
                            res.redirect('/user/tagUser?gocid=' + gocid);
                        }
                    }
                    else {
                        if (type == 'remove') {
                            req.session.msg = "Tag Removal Failed";
                            res.status(500).send("");
                        } else {
                            req.session.msg = 'Tag Addition Failed';
                            res.redirect('/user/tagUser?gocid=' + gocid);
                        }
                    }
                }
            }
            else {
                console.log('Not an admin user...');
                delete req.session.loginType;
                res.redirect('/');
            }
        }
        catch (error) {
            console.error({ error: error, service: 'UserController.tagUser' });
            return res.status(500).send("Error");
        }
    },

    counters: async function (req, res) {
        try {
            let gocid = req.param('gocid');
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId[0] != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }  
            if(cashPermissionForGames.includes(Number(game_id))){
            let sql = `SELECT GROUP_CONCAT(lrr.WalletID) AS WalletID,lrr.ID,lrr.RefID,lrr.RuleName,lrr.Status,lrr.StartDate,lrr.EndDate,lrr.StartTime,lrr.EndTime,lrr.MinVal,lrr.MaxVal,lrr.ReportType FROM ledger_report_rule lrr JOIN game_user_wallet guw ON guw.WalletID = lrr.WalletID WHERE guw.GOCID = $1 GROUP BY RefID`;
            let data = (await sails.getDatastore('slave').sendNativeQuery(sql,[gocid])).rows;
            res.view({
                gocid: gocid,
                data: data,
                cashPermissionForGames:cashPermissionForGames.includes(Number(game_id))
            })
            }else{
                req.session.msg = 'Not available for this game.'
                res.view({
                    gocid: gocid,
                    data: [],
                    cashPermissionForGames:cashPermissionForGames.includes(Number(game_id))
                })
            }
        } catch (error) {
            console.error({ error: error, service: 'UserController.counters', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    editCounters: async function (req, res) {
        try {
            let gocid = req.param('gocid');
            let walletLabelMap = {};
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId[0] != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }  
            if (req.method == 'GET') {
                if(cashPermissionForGames.includes(Number(game_id))){
                let sql = `SELECT WalletAllowed, WalletLabel FROM game_player_master gpm JOIN game_master gm ON gm.GameID = gpm.GameID WHERE gpm.GOCID = $1`;
                let data = (await sails.getDatastore('slave').sendNativeQuery(sql, [gocid])).rows;
                if (data && data.length) {
                    let wallets = data[0].WalletAllowed.split(',');
                    let walletLabels = data[0].WalletLabel.split(',');
                    for (let i = 0; i < wallets.length; i++) {
                        walletLabelMap[wallets[i]] = walletLabels[i];
                    }
                }
                let reportRule = sails.config.ledgerQueueSettings.Rules;
                let getWalletIdSql = `SELECT WalletID, WalletLabel FROM game_user_wallet WHERE GOCID = $1`;
                let walletId = (await sails.getDatastore('slave').sendNativeQuery(getWalletIdSql,[gocid])).rows;
                if (walletId && walletId.length) {
                    let rules = Object.keys(reportRule);
                    res.view({
                        gocid: gocid,
                        rules: rules,
                        walletId: walletId,
                        walletLabelMap: walletLabelMap
                    });
                } else {
                    req.session.msg = 'No Wallet IDs Found For this User';
                    res.redirect('/User/counters?gocid=' + gocid);
                }
                }else{
                    req.session.msg = 'Not allowed fot this game.';
                    res.redirect('/User/counters?gocid=' + gocid);
                }
            } else if (req.method == 'POST') {
                let params = req.allParams();
                if(new Date(params.fromDate) >= new Date(params.toDate)){
                    req.session.msg = 'Start Date Should be less than End Date';
                    return res.redirect('/User/counters?gocid=' + gocid)
                }
                if(params.startTime >= params.endTime){
                    req.session.msg = 'Start Time Should be less than End Time';
                    return res.redirect('/User/counters?gocid=' + gocid)
                }
                if(Number(params.minVal) >= Number(params.maxVal)){
                    req.session.msg = 'Min Val Should be Less than Max Val';
                    return res.redirect('/User/counters?gocid=' + gocid)
                }
                let walletIds = [];
                if(!Array.isArray(params.walletId)){
                    walletIds.push(params.walletId);
                } else {
                    walletIds = params.walletId;
                }
                let refId = await getRandomRefId();

                params.fromDate = Moment.init(new Date(params.fromDate)).format('YYYY-MM-DD HH:mm:ss');
                params.toDate = Moment.init(new Date(params.toDate)).format('YYYY-MM-DD HH:mm:ss');

                let insertSql = `INSERT INTO ledger_report_rule (RefID, WalletID, RuleName, Status, StartDate, EndDate, StartTime, EndTime, MinVal, MaxVal, ReportType) VALUES`;
                for (let i=0;i<walletIds.length;i++) {
                    insertSql += `('${refId}' , '${walletIds[i]}' , '${params.ruleName}' , '1' , '${params.fromDate}' , '${params.toDate}' , '${params.startTime}' , '${params.endTime}' , '${params.minVal}' , '${params.maxVal}' , '${params.ruleType}'),`;
                }
                insertSql = insertSql.slice(0, -1);
                let insert = (await sails.getDatastore('master').sendNativeQuery(insertSql, []))

                if(insert.affectedRows){
                    req.session.msg = 'Data Inserted Successfully!!!';
                } else {
                    req.session.msg = 'Data Insertion Failed!!!';
                }
                res.redirect('/User/counters?gocid=' + gocid)
            }
        } catch (error) {
            console.error({ error: error, service: 'UserController.editCounters', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    updateCounter: async function (req, res) {
        try {
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if(cashPermissionForGames.includes(Number(game_id))){
            let id = req.param('id');
            let page = req.param('page'),tableName = '';

            if(page == 'ledger')
                tableName = 'ledger_report_rule';
            else if(page == 'custodianLedger')
                tableName = 'custodian_ledger_report_rule';

            let updateSql = `UPDATE ` + tableName + ` SET Status = Status XOR 1 WHERE RefID = $1`;
            let update = (await sails.getDatastore('master').sendNativeQuery(updateSql,[id]));
            if (update.changedRows) {
                return res.status(200).send("Status Changed Successfully");
            } else {
                return res.status(500).send('Updation Failed')
            }
        }
        } catch (error) {
            console.error({ error: error, service: 'UserController.updatecounters', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.status(500).send()
        }
    },

    custodianCounters: async function (req, res) {
        try {
            let gocid = req.param('gocid');
            if (!gocid){
                req.session.msg = "Please select a user";
                return res.redirect('/admin/searchUserProfile');
            }
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId[0] != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }  
            if(cashPermissionForGames.includes(Number(game_id))){
            let getDataCustodianCounterQuery = `SELECT GROUP_CONCAT(lrr.WalletID) AS WalletID, GROUP_CONCAT(lrr.ToWalletID) as ToWalletID, lrr.ID, lrr.RefID, lrr.RuleName, lrr.FlowDirection, lrr.RuleAppliedON, lrr.Status, lrr.StartDate, lrr.EndDate, lrr.StartTime, lrr.EndTime, lrr.MinVal, lrr.MaxVal FROM custodian_ledger_report_rule lrr JOIN game_user_wallet guw ON guw.WalletID = lrr.WalletID WHERE guw.GOCID = $1 GROUP BY RefID; `;
            let dataFromCustodianReport = await sails.getDatastore('slave').sendNativeQuery(getDataCustodianCounterQuery,[gocid]);

            res.view({
                gocid:gocid,
                data: dataFromCustodianReport.rows.length>0?dataFromCustodianReport.rows:[],
                cashPermissionForGames:cashPermissionForGames.includes(Number(game_id))
            });
            }else{
                req.session.msg = "Not present for this game.";
                res.view({
                    gocid:gocid,
                    data: [],
                    cashPermissionForGames:cashPermissionForGames.includes(Number(game_id))
                });
            }
        } catch(error) {
            console.error({ error: error, service: 'UserController.custodianCounters', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    editCustodianCounters: async function (req, res) {
        try {
            let gocid = req.param('gocid');
            let walletLabelMap = {};
            let systemWalletDetails =[];
            let walletId=[];
            let game_id = req.session.AdminCurrentGame;
            if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                game_id = req.session.AdminCurrentGame;
            } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            let getGameIdQuery = "SELECT GameID FROM game_player_master WHERE GOCID = $1";
            let getGameId = (await sails.getDatastore("slave").sendNativeQuery(getGameIdQuery,[gocid])).rows;
            if(getGameId.length==0) {
                return res.redirect('/');
            }
            if(typeof getGameId[0] != 'undefined' && typeof getGameId[0].GameID != 'undefined' && getGameId[0].GameID != game_id){
                req.session.msg = 'Game is not matching admin selected game.';
                return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
            }
            if (req.method == 'GET') {
                if(cashPermissionForGames.includes(Number(game_id))){
                let sql = `SELECT WalletAllowed, WalletLabel,gm.GameID FROM game_player_master gpm JOIN game_master gm ON gm.GameID = gpm.GameID WHERE gpm.GOCID = $1`;
                let data = (await sails.getDatastore('slave').sendNativeQuery(sql, [gocid])).rows;
                if (data && data.length) {
                    let game_id;
                    game_id = data[0].GameID;
                    let wallets = data[0].WalletAllowed.split(',');
                    let walletLabels = data[0].WalletLabel.split(',');
                    for (let i = 0; i < wallets.length; i++) {
                        walletLabelMap[wallets[i]] = walletLabels[i];
                    }
                }
                systemWalletDetails = await UtilService.getSystemWalletDetails(game_id);
                let getWalletIdSql = `SELECT WalletID, WalletLabel FROM game_user_wallet WHERE GOCID = $1`;
                walletId = (await sails.getDatastore('slave').sendNativeQuery(getWalletIdSql,[gocid])).rows;
                if (walletId && walletId.length) {
                    res.view({
                        gocid: gocid,
                        walletId: walletId,
                        walletLabelMap: walletLabelMap,
                        systemWalletDetails : systemWalletDetails
                    });
                } else {
                    req.session.msg = 'No Wallet IDs Found For this User';
                    res.redirect('/User/custodianCounters?gocid=' + gocid);
                }
                }else{
                    req.session.msg = 'Not available for this game.';
                    res.redirect('/User/custodianCounters?gocid=' + gocid);
                }
            } else if (req.method == 'POST') {
                let params = req.allParams();
                if(cashPermissionForGames.includes(Number(game_id))){
                if(new Date(params.fromDate) >= new Date(params.toDate)){
                    req.session.msg = 'Start Date Should be less than End Date';
                    return res.redirect('/User/custodianCounters?gocid=' + gocid)
                }
                if(params.startTime >= params.endTime){
                    req.session.msg = 'Start Time Should be less than End Time';
                    return res.redirect('/User/custodianCounters?gocid=' + gocid)
                }
                if(Number(params.minVal) >= Number(params.maxVal)){
                    req.session.msg = 'Min Val Should be Less than Max Val';
                    return res.redirect('/User/custodianCounters?gocid=' + gocid)
                }
                let walletIds = [];
                if(!Array.isArray(params.walletId)){
                    walletIds.push(params.walletId);
                } else {
                    walletIds = params.walletId;
                }
                let refId = await getRandomRefId();

                params.fromDate = Moment.init(new Date(params.fromDate)).format('YYYY-MM-DD HH:mm:ss');
                params.toDate = Moment.init(new Date(params.toDate)).format('YYYY-MM-DD HH:mm:ss');

                let insertSql = `INSERT INTO custodian_ledger_report_rule (RefID, WalletID, ToWalletID, FlowDirection, RuleAppliedON, RuleName, Status, StartDate, EndDate, StartTime, EndTime, MinVal, MaxVal) VALUES`;
                for (let i=0;i<walletIds.length;i++) {
                    insertSql += `('${refId}' , '${walletIds[i]}', '${params.toWalletID}' ,'${params.flowDirection}','${params.ruleAppliedON}', '${params.ruleName}' , '1' , '${params.fromDate}' , '${params.toDate}' , '${params.startTime}' , '${params.endTime}' , '${params.minVal}' , '${params.maxVal}') ,`;
                }
                insertSql = insertSql.slice(0, -1);
                let insert = (await sails.getDatastore('master').sendNativeQuery(insertSql, []))

                if(insert.affectedRows){
                    req.session.msg = 'Data Inserted Successfully!!!';
                } else {
                    req.session.msg = 'Data Insertion Failed!!!';
                }
                res.redirect('/user/custodianCounters?gocid=' + gocid)
            }
        }

        } catch (error) {
            console.error({ error: error, service: 'UserController.editCustodianCounters', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },

    emailChargebackDocuments: async function (req, res) {
        try {
            if (req.session.loginType == 'gplus') {
                let adminId = req.session.adminUserId;
                var adminQuery = `SELECT email from acl_admins WHERE admin_id = ${adminId}`;
                var adminDetails = (await sails.getDatastore('slave').sendNativeQuery(adminQuery,[])).rows;
                let game_id = req.session.AdminCurrentGame;
                if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
                    game_id = req.session.AdminCurrentGame;
                  } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
                    req.session.msg = 'Game is not matching admin selected game.';
                    return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
                  }
                if (req.method == 'POST') {
                    if(cashPermissionForGames.includes(Number(game_id))){
                    var transactionId = req.param("transactionId");
                    var depositQuery = `SELECT guw.GOCID, lgr.LedgerID, di.InvoicePath FROM deposit_invoice di JOIN ledger lgr ON di.TransactionID=lgr.TransactionID JOIN game_user_wallet guw ON guw.WalletID = lgr.WalletID WHERE lgr.TransactionID= '${transactionId}' LIMIT 1`;
                    var depositDetails = (await sails.getDatastore('slave').sendNativeQuery(depositQuery,[])).rows;
                    if(depositDetails.length>0) {
                        let invoicePath = depositDetails[0]['InvoicePath']
                        let bucketName = ((invoicePath.split("//"))[1].split("."))[0];
                        let fileName = invoicePath.split("/").pop();
                        let subDir = ((invoicePath.split("amazonaws.com/").pop()).split('/'+fileName))[0];
                        var userLedger = await getUserLedgerData(depositDetails[0]['GOCID'], depositDetails[0]['LedgerID'], transactionId);
                        var depositInvoice = await getDepositInvoice(bucketName, fileName, subDir);
                        
                        await sendDepsoitEmail(adminDetails[0]['email'], transactionId, fileName, depositInvoice.Body, userLedger);
                        req.session.msg = "Email sent successfully";
                    } else {
                        req.session.msg = `Invalid Transaction ID: ${transactionId}, Please enter a valid transaction id.`;
                    }
                    res.redirect("/user/emailchargebackdocuments");
                } else {
                    return res.view({email:adminDetails[0]['email'], name:req.session.adminUserName});
                }
            } else {
                req.session.msg = 'Something went wrong.. Please try again later..';
                return res.redirect('/');
            }
        }
        }  catch (error) {
            console.error({ error: error, service: 'UserController.emailChargebackDocuments', line: new Error().stack.match(/(:[\d]+)/)[0].replace(':', ''), error_at: Moment.getTimeForLogs() });
            req.session.msg = 'Something went wrong.. Please try again later..';
            return res.redirect('/');
        }
    },


}

var getUserLedgerData = async function (gocid, ledgerId, transactionId) {
    let game_id = req.session.AdminCurrentGame;
    if (typeof game_id === 'undefined' && req.session.AdminCurrentGame !== 'undefined') {
        game_id = req.session.AdminCurrentGame;
      } else if (typeof req.session.AdminCurrentGame !== 'undefined' && game_id != req.session.AdminCurrentGame) {
        req.session.msg = 'Game is not matching admin selected game.';
        return res.redirect('/admin/searchUserProfile?game_id=' + game_id);
      }
    if(cashPermissionForGames.includes(Number(game_id))){
    let selectTransactionType =  `SELECT gs.Value as transaction from game_settings gs JOIN game_player_master gpm ON gs.GameID=gpm.GameID WHERE gpm.GOCID= $1 and Setting='LEDGER_TRANSACTION_TYPE';`;
    let TransactionType = (await sails.getDatastore("slave").sendNativeQuery(selectTransactionType, [gocid])).rows[0];
    tranx_map = JSON.parse(TransactionType.transaction);

    let query = `Select lg.LedgerId, CONCAT(lg.SysCreationDate, ' ' ,lg.SysCreationTime) AS SysCreationDate, lg.TransactionType, lg.Amount/cm.CurrencyDisplayUnit AS Amount, lg.WalletID, lg.InitialBalance/cm.CurrencyDisplayUnit as InitialBalance, lg.ClosingBalance/cm.CurrencyDisplayUnit as ClosingBalance, lg.TransactionID, guw.WalletLabel, guw.GOCID, cm.CurrencyLabel FROM ledger lg JOIN game_user_wallet guw ON guw.WalletID = lg.WalletID JOIN wallet_master wm ON guw.WalletID = wm.WalletID JOIN currency_master cm on wm.CurrencyID = cm.CurrencyID WHERE lg.LedgerId >= ${ledgerId} and guw.GOCID= '${gocid}' ORDER BY lg.LedgerId, lg.TransactionID limit 10`;
    let ledgerData = (await sails.getDatastore('slave').sendNativeQuery(query,[])).rows;
    var html = `<html><head><style>#form-table td { text-align: center; } #table-header th { border:1px solid #000; border-width:2px 0; font-size: 20px; }.table-row td { border:1px solid #000; border-width:1px 0 1px 0; font-size: 18px; } .padded { padding-top:1cm; } tr:nth-child(even) { background:#DDDDDD }tr:nth-child(odd) { background:#FFFFFF } </style></head><body style="background-color: #83DAF6;font-size:small;"><section style="padding: 0.5in 0;"><table style="width:99%;" id="form-table" cellspacing="0">
    <thead><tr id="table-header" style="background-color: azure;"></th>
    <th>Transaction ID</th>
    <th>Date</th>
    <th>Transaction Type</th>
    <th>Amount</th>
    <th>Initial Balance</th>
    <th>Closing Balance</th>
    <th>GOCID</th>
    </thead><tbody>`;
        
    for(data in ledgerData) {
        style = ledgerData[data]['TransactionID'] == transactionId ? 'style="background-color: #17d280"': '';
        html +=`<tr ${style} class="table-row">
            <td>${ledgerData[data]['TransactionID']}</td>
            <td>${ledgerData[data]['SysCreationDate']}</td>
            <td>${tranx_map[ledgerData[data]['TransactionType']]['label']}</td>
            <td>${ledgerData[data]['Amount']}</td>
            <td>${ledgerData[data]['InitialBalance']}</td>
            <td>${ledgerData[data]['ClosingBalance']}</td>
            <td>${ledgerData[data]['GOCID']}</td>
        </tr>`;
    }
    html +=`</tbody></table></section></body></html>`;
    return ledgerBuffer = await generatePDF(html);
}
}

var generatePDF = async function(html) {
    var PDF = require('save-as-pdf');
    let options = { format: 'A4', landscape: true };
    let file = { content: html };
    const pdfBuffer = await PDF.generate(file, options);
    return pdfBuffer;
}

var sendDepsoitEmail = async function(sendTo, transactionId, fileName, depositInvoice, transactionData) {
    let to = sendTo;
    let emailInfo = {
        subject: `Octro Poker - Chargeback Documents for Transaction ID : ${transactionId}`,
        fromEmail: sails.config.PokerProEmail,
        fromName: "OctroPokerPro",
        to: to,
        name: 'admin',
        mailType: 'SMTP2',
        user_id: JSON.stringify(to),
        message: `<html><head></head><body><p> Please find the ledger screenshot and Invoice for transactionid: ${transactionId}</p></body></html>`,
        attachments: [
          {
            type: "application/pdf",
            name: fileName,
            content: depositInvoice
          },{
            type: "application/pdf",
            name: transactionId+'.pdf',
            content: transactionData
          }]
    };
    await EmailService.simpleSendEmail(emailInfo);
    return true;
}

var getDepositInvoice = async function(bucketName, fileName, subDir) {
    AWS.config.update({
        accessKeyId: sails.config.awsAccessId,
        secretAccessKey: sails.config.awsSecretIdKey,
        region: sails.config.awsRegion
    });
    // Configure AWS SDK
    const s3 = new AWS.S3({});
    // Specify the bucket name and file key
    bucketName = bucketName + '/' + subDir;
    const fileKey = fileName;
    // Set up parameters for getObject
    const params = {
        Bucket: bucketName,
        Key: fileKey
    };
    // Fetch file from S3
    const data =  await s3.getObject(params).promise();
    return data;
}


var findLid = async function(adminId, gocid) {
    let CurrentDate =Moment.init(new Date().setDate(new Date().getDate())).format('YYYY-MM-DD');
    let selectSql = `SELECT cd.Id AS id,cc.maxAttemptCalls, cd.attemptedCallCount, cd.gocid, cd.ReasonComments,cd.GroupID, cd.AdminID, cd.AgentID, GROUP_CONCAT(cd.Reason) AS Reason FROM calling_data AS cd LEFT JOIN calling_user rcu on cd.CallingTableID = rcu.id JOIN calling_campaigns AS cc ON cd.CampaignId = cc.CampaignId INNER JOIN game_player_master AS ru ON cd.GOCID = ru.GOCID INNER JOIN player_profile AS rup ON ru.ocid = rup.ocid WHERE RecordUploadDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 10 DAY ) AND IF (Reason = "NEW DATA"OR Reason = "Invalid Game Plays"OR Reason = "New Referral Data", 0, 1 ) AND CallingDate >= $1 AND cd.Status = "working" AND cd.AgentID= $2 AND cd.GOCID = $3`;
    let lidObj = (await sails.getDatastore("slave").sendNativeQuery(selectSql, [CurrentDate, adminId,  gocid])).rows[0];
    return lidObj;
}

var putOneItemInDynamo = function (table, data) {
    AWS.config.update({
        accessKeyId: sails.config.awsAccessId,
        secretAccessKey: sails.config.awsSecretIdKey,
        region: sails.config.awsRegion
    });
    const ddb2 = new AWS.DynamoDB({ apiVersion: '2012-08-10' });
      try {
        var params = {
          TableName: table,
          Item: data
        };
        ddb2.putItem(params, function(err) {
          if (err) {
            console.log("Error", err);
          } 
        });
      } catch(error) {
        console.error({ error : error});
      }
  }

var getRandomRefId = async function () {
    let currentdate = new Date();
    const day = currentdate.getDate() > 9 ? currentdate.getDate() : ('0' + currentdate.getDate());
    const month = currentdate.getMonth() + 1 > 9 ? currentdate.getMonth() + 1 : ('0' + (currentdate.getMonth() + 1));
    const year = currentdate.getFullYear();
    const microtime = Date.now().toString();
    const randomNo = String(Math.floor(Math.random() * 10000));
    currentdate = `${year}${month}${day}`;
    let hash = createHash('sha256').update(randomNo + microtime).digest('hex').substring(0, 12);
    return String(currentdate) + 'z' + hash;
}
async function checkServiceOfGame(req,game_id,redirect=false){
    if(isValidUserGame(req,game_id) && isValidUserRole(req,['SUPER_ADMIN','TRINITY STORE'])){
        let gameQuery = `select GameName,GameAPPID,GameToken from game_endpoints ge join game_master gm on ge.AppID=gm.GameAPPID where gm.GameId=${game_id} and ge.module='webstore' and ge.status=1 and gm.status=1 and ge.EndPointType='websocket'`;
        let result = (await sails.getDatastore("slave").sendNativeQuery(gameQuery, [])).rows;
        if(redirect==false){
            return result;
        }else if(!result || result.length<1){
            return '/admin/searchUserProfile?game_id='+game_id;
        }
    }
    return false;
}

function isViewOnly(req){
    return ('undefined' != typeof req.session.IsViewerOnly) ? req.session.IsViewerOnly : 0;
}

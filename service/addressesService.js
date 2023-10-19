const addressesDAO = require('../repository/addressesDAO');
const axios = require('axios');

const AWS = require('aws-sdk')
AWS.config.update({
    region: 'us-west-1'
})
const secretsManager = new AWS.SecretsManager();
const params = {
    SecretId: 'prod/GG/key'
};

const API_KEY = async () => {
    try{
        const data = await secretsManager.getSecretValue(params).promise();
        const secret = JSON.parse(data.SecretString);
        console.log(secret.API_KEY)
        return secret;
    }catch (error) {
        console.error('Error fetching secret:', error);
        throw error;
    }
}
const GOOGLE_MAPS_API = 'https://maps.googleapis.com/maps/api/geocode/json?address='

// ============================== Geocoding Service Calls ==============================
// Get address from user_id
function getAddress(user_id){
    logger.info('getAddress service called');
    return new Promise((resolve, reject) => {
        addressesDAO.getAddress(user_id).then((data) => {
            logger.info('getAddress resolved')
            let geoAddress = formatAddress(data.Item.address);
            axios.get(`${GOOGLE_MAPS_API}${geoAddress}${API_KEY}`).then((res) => {
                logger.info('Google Maps API call successful')
                resolve(res.data.results[0].geometry.location);
            }).catch((err) => {
                logger.error(`Error attempting to call Google Maps API: ${err}`)
                reject(err);
            });
        }).catch((err) => {
            logger.error(`Error attempting to getAddress: ${err}`)
            reject(err);
        });
    });
}

// Get all addresses in the same state
 function getAllAddresses(user_id){
    logger.info('getAllAddresses service called');
    return new Promise((resolve, reject) => {
        addressesDAO.getAllAddresses().then((data) => {
            logger.info('getAllAddresses resolved')
            // Create list of requests to wait to resolve them until all are done
            const requests = [];
            // Create list for users to be stored in as they are resolved
            let users = [];
            for(let i = 0; i < data.Items.length; i++){
                if(data.Items[i].user_id == user_id){
                    data.Items.splice(i, 1);
                }
                // Format address for geocoding
                let geoAddress = formatAddress(data.Items[i].address);
                // Create request to Google Maps API
                if(geoAddress != null){
                    const request = axios.get(`${GOOGLE_MAPS_API}${geoAddress}${API_KEY}`).then((res) => {
                        logger.info('Google Maps API call successful')
                        // Create user object to push to users list
                        let user = {
                            user_id: data.Items[i].user_id,
                            username: data.Items[i].username,
                            address: res.data.results[0].geometry.location
                        }
    
                        // Push user to users list
                        users.push(user);
                    }).catch((err) => {
                        logger.error(`Error attempting to call Google Maps API: ${err}`)
                        reject(err);
                    });
                    requests.push(request);
                }
                console.log(users)
                // Wait for all requests to resolve
            }
            Promise.all(requests).then(() => {
                resolve(users);
            }).catch((err) => {
                logger.error(`Error attempting to getAllAddresses: ${err}`)
                reject(err);
            });
        }).catch((err) => {
            logger.error(`Error attempting to getAllAddresses: ${err}`)
            reject(err);
        });
    });
}

// Format address for geocoding
function formatAddress(address) {
    if(!address.street_name){
        return null;
    }
    const concatString = `${address.street_number} ${address.street_name} ${address.city} ${address.state} ${address.zip}`;
    return concatString.replace(/\s+/g, '%20');
    
}

// ============================== Logger ==============================
// Winston logger setup
const { createLogger, transports, format} = require('winston');

// Create the logger
const logger = createLogger({
    level: 'info', 
    format: format.combine(
        format.timestamp(),
        format.printf(({timestamp, level, message}) => {
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        new transports.Console(), // log to the console
    ]
})

module.exports = {
    getAddress,
    getAllAddresses
}
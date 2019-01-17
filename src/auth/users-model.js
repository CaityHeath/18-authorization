'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SINGLE_USE_TOKENS = !!process.env.SINGLE_USE_TOKENS;
const TOKEN_EXPIRE = process.env.TOKEN_LIFETIME || '5m';

//let secret = setInterval(()=> console.log(faker.random.word()), 200000).toString();

let SECRET = process.env.SECRET;
const usedTokens = new Set();

const users = new mongoose.Schema({
  username: {type:String, required:true, unique:true},
  password: {type:String, required:true},
  email: {type: String},
  role: {type: String, default:'user', enum: ['admin','editor','user']},
});

users.pre('save', function(next) {
  bcrypt.hash(this.password, 10)
    .then(hashedPassword => {
      this.password = hashedPassword;
      next();
    })
    .catch(console.error);
});

users.statics.createFromOauth = function(email) {

  if(! email) { return Promise.reject('Validation Error'); }

  return this.findOne( {email} )
    .then(user => {
      if( !user ) { throw new Error('User Not Found'); }
      console.log('Welcome Back', user.username);
      return user;
    })
    .catch( error => {
      console.log('Creating new user');
      let username = email;
      let password = 'none';
      return this.create({username, password, email});
    });

};


/**
 *This function is the heart of my 2nd bearer token security feature. It checks whether or not the token exists in the usedToken set. If it doesn't, the newly generated token gets added. If it does exist then an error is thrown. This limits the user to only being allowed to sign in with that password once. 
 *
 * @param {} token 
 * @returns either an error or the id associated with the user's account
 */
users.statics.authenticateBearer = function(token){
  if(usedTokens.has(token)) {
    throw 'Resource Not Available';
  } else {
    usedTokens.add(token);
    let parsedToken = jwt.verify(token, SECRET);
    let query = {_id:parsedToken.id};
    return this.findOne(query);    
  }
};

users.statics.authenticateBasic = function(auth) {
  let query = {username:auth.username};
  return this.findOne(query)
    .then( user => user && user.comparePassword(auth.password) )
    .catch(error => {throw error;});
};

users.methods.comparePassword = function(password) {
  return bcrypt.compare( password, this.password )
    .then( valid => valid ? this : null);
};

/**
 *This function handles my first bearer token security feature. At the point of token creation, the token is assigned an expiration date. In this case I set token expiration to be 600 seconds or 10 minutes. 
 *
 * @param {*} type 
 * @returns a token 
 */
users.methods.generateToken = function(type) {
  
  let token = {
    id: this._id,
    role: this.role,
    type: type || 'user',
  };
  
  return jwt.sign(token, SECRET, {expiresIn:600}); //expiration will be the third parameter
};

users.methods.generateKey = function() {
  return this.generateToken('key');
};

module.exports = mongoose.model('users', users);
const AppError = require('../utils/appError');

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/"(.*?)"/)[0];
  console.log(value);
  const message = `Duplicate field value: ${value} Please use another value`;

  return new AppError(message, 400);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid Input data. ${errors.join('. ')}`;

  return new AppError(message, 400);
};

const handleJwtToken = (err) =>
  new AppError('Invalid token pls login again!', 401);

const handleJwtExpireError = (err) =>
  new AppError('Login session expired login again', 401);

const sendErrorDev = (err, req, res) => {
  //API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  } else {
    //RENDERED WEBSITE
    return res.status(err.statusCode).render('error', {
      titile: 'Something went wrong',
      msg: err.message,
    });
  }
};

const sendErrorProd = (err, req, res) => {
  //API
  if (req.originalUrl.startsWith('/api')) {
    //OPeration or trusted error send msg to client
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
      });

      //programing or other unknown errror : dont leak error details
    } else {
      //1 log error
      console.error('ERROR', err);
      //2 Send generic error
      return res.status(500).json({
        status: 'error',
        message: 'Something went wrong',
      });
    }
  } else {
    //RENDERED WEBSITE
    //OPeration or trusted error send msg to client
    if (err.isOperational) {
      return res.status(err.statusCode).render('error', {
        titile: 'Something went wrong',
        msg: err.message,
      });

      //programing or other unknown errror : dont leak error details
    } else {
      //1 log error
      console.error('ERROR', err);
      //2 Send generic error
      return res.status(err.statusCode).render('error', {
        titile: 'Something went wrong',
        msg: 'Please try again later',
      });
    }
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, req, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = Object.create(err);
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === 11000) error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJwtToken(error);
    if (err.name === 'TokenExpiredError') error = handleJwtExpireError(error);
    sendErrorProd(error, req, res);
    // sendErrorProd(error, res);
  }
};

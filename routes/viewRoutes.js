const express = require('express');

const router = express.Router();
const viewController = require('../controllers/viewController');
const authController = require('../controllers/authController');

//ISKO UPAR LAYA KYUKI .isLoggedin aur .protect lagbhag same hai faltu mai same operation nhi karna hai
router.get('/me', authController.protect, viewController.getAccount);

router.post(
  '/submit-user-data',                  //IF WE UPDATE USER WITHOUT USING API THEN THIS EXTRA ROUTE IS REQUIRED
  authController.protect,
  viewController.updateUserData
);

router.use(authController.isLoggedin);

router.get('/', viewController.getOverview);
router.get('/tour/:slug', viewController.getTour);
router.get('/login', viewController.login);

module.exports = router;

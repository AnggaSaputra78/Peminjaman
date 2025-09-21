const express = require('express');
const router = express.Router();
const { Loan, Device } = require('../models');


// list
router.get('/', async (req, res) => {
const loans = await Loan.findAll({ include: Device });
res.render('loans/list', { loans });
});


// create form
router.get('/create', async (req, res) => {
const devices = await Device.findAll();
res.render('loans/form', { loan: null, devices });
});


// store
router.post('/', async (req, res) => {
const { borrower, deviceId, startDate, endDate } = req.body;
await Loan.create({ borrower, deviceId, startDate, endDate, status: 'Dipinjam' });
res.redirect('/loans');
});


// return device (update status and endDate)
router.post('/:id/return', async (req, res) => {
const loan = await Loan.findByPk(req.params.id);
await loan.update({ status: 'Kembali', endDate: req.body.endDate || new Date() });
res.redirect('/loans');
});


module.exports = router;
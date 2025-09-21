const express = require('express');
const router = express.Router();
const { Device } = require('../models');


// list
router.get('/', async (req, res) => {
const devices = await Device.findAll();
res.render('devices/list', { devices });
});


// create form
router.get('/create', (req, res) => res.render('devices/form', { device: null }));


// store
router.post('/', async (req, res) => {
const { name, type, serial, condition } = req.body;
await Device.create({ name, type, serial, condition });
res.redirect('/devices');
});


// edit form
router.get('/:id/edit', async (req, res) => {
const device = await Device.findByPk(req.params.id);
res.render('devices/form', { device });
});


// update
router.put('/:id', async (req, res) => {
const { name, type, serial, condition } = req.body;
const device = await Device.findByPk(req.params.id);
await device.update({ name, type, serial, condition });
res.redirect('/devices');
});


// delete
router.delete('/:id', async (req, res) => {
const device = await Device.findByPk(req.params.id);
await device.destroy();
res.redirect('/devices');
});


module.exports = router;
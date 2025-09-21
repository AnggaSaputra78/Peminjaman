const express = require('express');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const path = require('path');
const { sequelize } = require('./models');


const deviceRoutes = require('./routes/devices');
const loanRoutes = require('./routes/loans');


const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(methodOverride('_method'));


app.get('/', (req, res) => {
res.redirect('/devices');
});


app.use('/devices', deviceRoutes);
app.use('/loans', loanRoutes);


const PORT = process.env.PORT || 3000;


sequelize.sync().then(() => {
app.listen(PORT, () => {
console.log(`Server berjalan di http://localhost:${PORT}`);
});
}).catch(err => console.error(err));
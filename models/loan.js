const { DataTypes } = require('sequelize');


module.exports = (sequelize) => {
return sequelize.define('Loan', {
id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
borrower: { type: DataTypes.STRING, allowNull: false },
deviceId: { type: DataTypes.INTEGER, allowNull: false },
startDate: { type: DataTypes.DATEONLY, allowNull: false },
endDate: { type: DataTypes.DATEONLY, allowNull: true },
status: { type: DataTypes.STRING, defaultValue: 'Dipinjam' } // Dipinjam / Kembali
}, {
tableName: 'loans',
timestamps: true
});
};
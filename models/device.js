const { DataTypes } = require('sequelize');


module.exports = (sequelize) => {
return sequelize.define('Device', {
id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
name: { type: DataTypes.STRING, allowNull: false },
type: { type: DataTypes.STRING, allowNull: false },
serial: { type: DataTypes.STRING, allowNull: true },
condition: { type: DataTypes.STRING, allowNull: true, defaultValue: 'Baik' }
}, {
tableName: 'devices',
timestamps: true
});
};
const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    method: 'GET',
    route: 'user',
  });
});

router.post('/', (req, res) => {
  res.status(200).json({
    method: 'POST',
    route: 'user',
  });
});

module.exports = router;

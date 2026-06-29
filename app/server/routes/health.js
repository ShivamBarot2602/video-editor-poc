const express = require('express')

const router = express.Router()

// GET /api/health — trivial status check (no service layer needed)
router.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

module.exports = router

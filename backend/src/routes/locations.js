const router = require('express').Router()
// db is now req.db (tenant-isolated, set by tenantMiddleware)
const { auth } = require('../middleware/auth')

router.get('/', auth, (req, res) => res.json(req.db.prepare('SELECT * FROM locations ORDER BY hall,rack').all()))

router.post('/', auth, (req, res) => {
  const { hall, rack, side, shelf, row_num } = req.body
  const label = [hall, rack, side, shelf, row_num].filter(Boolean).join('-')
  const r = req.db.prepare('INSERT INTO locations (hall,rack,side,shelf,row_num,full_label) VALUES (?,?,?,?,?,?)').run(hall,rack,side,shelf,row_num,label)
  res.json(req.db.prepare('SELECT * FROM locations WHERE id=?').get(r.lastInsertRowid))
})

router.delete('/:id', auth, (req, res) => {
  req.db.prepare('DELETE FROM locations WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router

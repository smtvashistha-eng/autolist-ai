// src/api/index.js — Phase 1 JSON REST router (mounted at /api).
const express = require("express");
const router = express.Router();

router.use(require("./auth"));
router.use(require("./users"));
router.use(require("./businesses"));
router.use(require("./files"));       // Phase 2
router.use(require("./products"));    // Phase 2
router.use(require("./drafts"));      // Phase 2
router.use(require("./ai"));          // Phase 3
router.use(require("./images"));      // Phase 4
router.use(require("./jobs"));         // Phase 5
router.use(require("./templates"));    // Phase 6
router.use(require("./exports"));      // Phase 6
router.use(require("./billing"));      // Phase 7
router.use(require("./connections"));  // Phase 8
router.use(require("./admin"));        // Phase 8
router.use(require("./brand"));        // R1 Brand Memory

module.exports = router;

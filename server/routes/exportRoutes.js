import { Router } from 'express';
import * as archiverPkg from 'archiver';

const router = Router();

router.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="cadence-project-management.zip"');

  const ZipArchiveCtor = archiverPkg.ZipArchive;

  if (!ZipArchiveCtor) {
    res.status(500).json({ success: false, message: 'Zip exporter unavailable.' });
    return;
  }

  const archive = new ZipArchiveCtor({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate source archive.' });
    } else {
      res.end();
    }
    console.error('Zip export error:', err.message);
  });

  archive.pipe(res);

  const rootDir = process.cwd();
  archive.glob('**/*', {
    cwd: rootDir,
    dot: true,
    ignore: [
      'node_modules/**',
      'dist/**',
      '.git/**',
      'data/**',
      '*.db',
      '*.db-*',
      '*.zip',
    ],
  });

  archive.finalize();
});

export default router;

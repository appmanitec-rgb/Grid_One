console.error(
  [
    '[db:reset] Blocked to prevent accidental data loss.',
    'Use explicit manual commands only if you intentionally want to destroy data.',
  ].join(' '),
);
process.exit(1);

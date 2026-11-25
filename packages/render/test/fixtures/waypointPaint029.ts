export const waypointPaintSource029 = '@diagram block\nroot block @ (0, 250) pinned\nsink block @ (700, 250) pinned\n' +
  Array.from({ length: 6 }, (_, index) => `n${index} block @ (350, ${index * 110}) pinned\nstart${index} = root -> n${index}\nfinish${index} = n${index} -> sink\n`).join('') +
  'route edge start0 {\n  edit = waypoint at (180, 120)\n}\n';

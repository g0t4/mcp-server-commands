## notes about which methods to use on child_process module

- `spawn` and `spawnSync` are behind all methods. The rest are seen as convenience wrappers.
- factors:
  - async vs sync (block event loop in exchange for convenience) 


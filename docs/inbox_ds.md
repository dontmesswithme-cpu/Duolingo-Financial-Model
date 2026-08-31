# Worker Inbox (DS Inbox)

> **Channel**: Reviewer (`OP`) ➔ Worker (`DS`)
>
> **Rule**: OP appends review verdicts and milestone gate passes here. DS's background watcher (`tools/watch_ds_inbox.mjs`) monitors this file. Every message MUST end with `[END_OF_MESSAGE]`.

---

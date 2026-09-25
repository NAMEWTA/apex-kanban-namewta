# sync

Reserved product root for a future library or data sync product.

This directory is **not** the dashboard markdown write-back engine. That engine
moved to `src/dashboard-view/persist` (formerly `src/sync`) so the name `sync`
stays available here.

Do not import `dashboard-view` or `editor-view` internals from this product.
Talk to other products only through `plugin` commands and `shared` events.

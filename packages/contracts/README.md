# @toonspectrum/contracts

Focused runtime-neutral contracts shared by two or more deployable applications.

Keep this package free of React, DOM/browser runtime APIs, NestJS, database clients, HTTP clients, storage adapters, and application source imports. UI helpers stay in their owning app; only stable DTO/schema/constants/pure validation belong here.

Do not use this package as a shortcut for `packages/domains/*`. New exports require a real second consumer.
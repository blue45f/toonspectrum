# PR #919 protected-check retrigger

This temporary marker creates an owner-authored branch update so GitHub Actions can evaluate the protected `core` check after bot-authored integration commits were left in `action_required` without jobs.

The marker is removed in the immediately following commit; the product tree remains unchanged.

# Project requirements and roadmap

## Product goals

Family Gift Manager has two separate areas:

1. **Our Gifts** — gifts this household buys and tracks.
2. **Wishlists** — items other people may buy for each child.

These workflows must remain separate, including when the same real-world person appears in both.

## Our Gifts

### Kids' Christmas gifts
- Track gifts independently for each child.
- Gift categories: Undecided, Santa, Stocking, Main, Advent.
- Purchase statuses initially: Need to buy, Bought, Wrapped.
- Categories and statuses are separate configurable lists. Status labels and colors can be customized.
- Drag-and-drop order represents preference; there is no priority field.
- Gift fields: item, category, paid price, regular price, calculated savings, store, status, notes, and useful purchase date.
- Dashboard shows total spent per child. Retail totals and savings belong on detail/list views.
- Dashboard may surface outstanding buying and wrapping tasks.

### House gifts
- Shared household gifts are tracked separately and excluded from children's budgets.

### Gifts for other people
- Shopping tracker for people this household buys gifts for.
- Each recipient has a budget and birthday date, plus multiple gift records.
- Track gift idea/item, purchased item, store, paid and regular prices, savings, notes, and purchase status/category.
- This is not a wishlist-management directory.

### Unassigned gift inventory
- Track purchased gifts not yet assigned to a recipient or occasion.
- Track item, store, paid and regular prices, calculated savings, purchase date, notes, intended use, and status.
- Initial statuses: Available, Reserved, Assigned, Given.
- Assigning an inventory item should preserve its purchase information rather than creating a duplicate gift record.

## Wishlists

- One master wishlist per child.
- Default categories: Books, Toys, Clothing, Arts & Crafts, Tech, Games, Experiences, Miscellaneous. Categories are editable.
- Track item, description, product/retailer URL, price, category, availability, and sort order.
- Availability: Available, Purchased, No longer wanted.
- Drag-and-drop order is the priority mechanism; no priority field.
- Gift-giver directory and per-gift-giver/per-child budgets are separate from the gift-recipient directory above.
- Each child has an individual persistent share link.
- A gift-giver can receive a curated selection from the child's master list. The same item may appear on multiple gift-giver links.
- Guest view has no account, login, email, or sharing metadata.
- Guest taps a claim button, enters their name, and confirms. The name is self-reported.
- The item remains visible but is marked Claimed/grayed out, with the entered name and claim time available to parents.
- A claim updates every shared view of that item to prevent duplicate purchases.
- Parent-only claim history records claim and undo events.
- Parents can undo a claim or override availability.
- Share URLs are unlisted bearer links with long random tokens. Anyone who receives a forwarded link may open it.

## Multi-family accounts

- One Firebase project supports multiple independent households.
- Parents authenticate with email/password.
- A parent can access only household(s) where they are a member.
- Each household owns its children, gifts, recipients, gift-givers, budgets, wishlist data, and settings.
- Guest links expose only the specific curated wishlist associated with that token.
- An owner/invitation workflow will onboard and deactivate test households.
- Household isolation must be enforced by Firestore Security Rules, not just by frontend filtering.

## Technical constraints

- Plain HTML, CSS, and JavaScript; no React.
- GitHub for source control; GitHub Pages for static hosting.
- Firebase Authentication for parent accounts.
- Cloud Firestore for application data.
- Target approximately six households during early testing.
- Keep recurring costs at $0 where practical. Stay on Firebase Spark unless a future feature requires an explicit cost decision.
- Use Eastern Time (America/Detroit) for user-facing local dates/times where needed.
- Do not add Cloud Functions, paid services, or billing without discussing the tradeoff first.

## Roadmap

1. Confirm product requirements and Firestore model.
2. Scaffold the static frontend.
3. Configure Firebase web app connection and Authentication.
4. Implement and test Firestore Security Rules before storing real data.
5. Build parent household setup and membership.
6. Build Our Gifts workflows.
7. Build child wishlists and curated guest links.
8. Implement name-confirmed guest claims, shared claim state, and parent-only claim history.
9. Test household isolation and guest-link boundaries with multiple test households.
10. Deploy through GitHub Pages.

## Not in the initial build

- Automated birthday reminders (calendar can handle these initially).
- Full annual planning/history and advanced reporting.
- Task Manager integration. Keep the code organized so a future separate app could share backend infrastructure, but do not couple it now.

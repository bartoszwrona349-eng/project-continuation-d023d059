<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Booking privacy: non-admins read other users' bookings only via the `get_busy_slots` RPC (anonymised); full rows are RLS-limited to owner/admin. Why: users must not see others' request details.
- Overlaps are blocked by a DB trigger on `bookings`, not just UI. Why: concurrent requests can't double-book.
- NGO directory names are derived from RLS-protected bookings; ordinary users use their latest request's organization and administrators see distinct organizations. Why: no separate NGO membership model exists yet, and booking details must stay private.
- NGO profiles live in their own table (contact data + KRS), created by the signup trigger from user metadata; external registry and NGO-directory links are derived from KRS in src/lib/ngo.ts. Why: keep organization identity and external URL construction consistent without storing redundant links; REGON is optional for admins too.

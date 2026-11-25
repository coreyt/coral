# Inherited Profile P canary

This fixture violates every Profile P rule that reaches `docs/` by inheritance
and that no other Profile V fixture asserts. Its job is to prove that those
rules are still live under the Profile V configuration, so that a future
`docs/` delta cannot silently replace one of them.

##No space after the hash triggers MD018.

A reversed link (the guide)[./inherited-profile-p.md] triggers MD011.

An empty destination [like this]() triggers MD042.

An undefined label [like this][nowhere] triggers MD052.

1. first
3. third out of sequence

| Format | Direction |
| --- | --- |
| Coral DSL | read and write |
Mermaid | read |
| Graph-IR | read | extra |

Indented code block below:

    npm run verify

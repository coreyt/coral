# Override self-test

This fixture violates MD013 and MD004. The Profile V configuration exempts it
from MD013 only, through an `overrides` block using `combine: "merge"`, so a
run must report MD004 and must not report MD013. Without this, "an
accommodation exempts a file from one rule and leaves the rest live" would be
a claim in a document rather than a tested property of the configuration.

This prose line is deliberately far longer than the eighty column wrap that Profile P rule six requires, and it carries real spaces beyond the limit so the rule cannot treat it as an unbreakable link destination.

* an asterisk bullet, which MD004 must still report

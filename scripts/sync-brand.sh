#!/usr/bin/env bash
# Copy the brand files from an ik2 checkout at a given git ref. Usage: scripts/sync-brand.sh [--check] [ref]
set -euo pipefail

cd "$(dirname "$0")/.."

check=0
if [ "${1:-}" = "--check" ]; then
	check=1
	shift
fi

ik2="${IK2_DIR:-../ik2}"
if ! git -C "$ik2" rev-parse --git-dir >/dev/null 2>&1; then
	echo "sync-brand: no ik2 checkout at $ik2 (set IK2_DIR)." >&2
	exit 1
fi

# With no ref: when checking, the ref recorded at the last sync; when syncing, the newest release tag.
if [ -n "${1:-}" ]; then
	ref="$1"
elif [ "$check" -eq 1 ] && [ -f shared/BRAND_VERSION ]; then
	ref="$(sed -n 's/^commit: //p' shared/BRAND_VERSION)"
else
	ref="$(git -C "$ik2" describe --tags --abbrev=0 --match 'v*')"
fi

commit="$(git -C "$ik2" rev-parse --verify "$ref^{commit}")"

# source path in ik2 -> path here
pairs=(
	"design-system/tokens.css:shared/tokens.css"
	"DESIGN.md:DESIGN.md"
	"docs/lab-tool-guidelines.md:docs/tool-guidelines.md"
)

stale=0
for pair in "${pairs[@]}"; do
	from="${pair%%:*}"
	to="${pair##*:}"

	if [ "$check" -eq 1 ]; then
		if ! git -C "$ik2" show "$commit:$from" | cmp -s - "$to"; then
			echo "sync-brand: $to differs from ik2 $from at $ref" >&2
			stale=1
		fi
	else
		git -C "$ik2" show "$commit:$from" > "$to"
		echo "sync-brand: $to <- ik2 $from"
	fi
done

if [ "$check" -eq 1 ]; then
	[ "$stale" -eq 0 ] && echo "sync-brand: copies match ik2 at $ref"
	exit "$stale"
fi

printf 'ref: %s\ncommit: %s\n' "$ref" "$commit" > shared/BRAND_VERSION
echo "sync-brand: recorded $ref ($commit)"

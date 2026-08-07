# Price Chart Navigation and Tooltip Design

## Goal

Make the crop price chart easier to read and navigate without changing the underlying price history: remove duplicate-looking anomaly connections, keep tooltips visually stable, move fixed windows by real time units, and simplify the full-history date axis.

## Confirmed Behavior

- The normal trend path remains the only line connecting price samples.
- Anomalies keep their translucent time band and endpoint marker, but no longer draw a second line between their previous and current samples.
- Point tooltips render as an HTML overlay with a fixed pixel width and height. Moving to another time window must not resize the tooltip.
- The `1h`, `6h`, `12h`, and `24h` views move in one-hour steps.
- The `7d` and `30d` views move in one-day steps.
- A normal mouse wheel scrolls downward toward older history and upward toward newer history. Horizontal touchpad scrolling follows its natural horizontal direction.
- Pointer dragging remains proportional while the pointer moves, then snaps the visible window end to the view's time unit so the final range is aligned to one hour or one day rather than to a data point.
- The `all` view always shows the complete history and has no drag or wheel navigation.
- The `all` view uses evenly sampled date ticks with the first and last labels preserved. Its data points and trend path are not sampled or removed.
- Long values in the current-price number input receive enough right padding to remain clear of the browser's increment and decrement controls.

## Root Cause of the Duplicate-Looking Lines

The chart currently renders both a complete trend path and a thick anomaly segment. The complete trend path includes merged cloud and local samples. The anomaly segment uses the two timestamps stored in the anomaly event. When a local sample falls between those event timestamps, the normal path bends through it while the anomaly segment connects directly across it. Those two valid but different paths form a fan shape.

The anomaly event data does not need to be deleted or rewritten. Removing only the redundant anomaly segment leaves the real merged timeline intact and keeps the anomaly band and marker available to explain the event.

## Components and Data Flow

### Chart time utility

Extend the existing chart time utility with deterministic helpers for:

- selecting the step size from the active window;
- shifting a visible end by an integer number of steps and clamping it to the available history;
- snapping a drag result to the appropriate hour or day boundary;
- sampling a long list of date slots to a bounded number while preserving both ends.

These helpers stay independent of the DOM and are covered with Node tests.

### Chart renderer

The renderer continues to calculate the visible range, axis, path, points, anomaly bands, and summary values. It stops emitting anomaly connection lines. For `all`, it samples only the tick slots before generating vertical grid lines and labels.

Point markers expose their timestamp and price through data attributes. Tooltip content moves outside the SVG into one reusable HTML element inside the chart wrapper. Pointer hover and keyboard focus update and position that element using wrapper-relative pixel coordinates, clamped so it remains inside the chart.

### Gesture handling

Gesture handling is enabled only when the selected window has a finite duration and more history exists than fits in that duration.

- Wheel input is accumulated until it represents one navigation action, preventing high-resolution touchpads from skipping many steps.
- Vertical wheel direction maps down to older data and up to newer data.
- Horizontal wheel input maps right to newer data and left to older data.
- Dragging previews continuous movement for responsiveness and snaps to the configured time unit when released.
- The `all` view has no drag marker, no grab cursor, and its wheel handler exits without preventing native page scrolling.

## Error and Boundary Handling

- Navigation clamps at the oldest and newest valid window ends.
- A window with insufficient history remains fixed and does not advertise drag behavior.
- Tooltip positioning is clamped on all sides and is hidden when the pointer leaves, focus moves away, the modal closes, or the chart rerenders.
- Missing or invalid point data does not create a tooltip.
- Date sampling handles empty and single-slot ranges without division by zero.

## Testing

Automated tests will cover:

- hour and day step selection;
- step-based shifting and boundary clamping;
- drag snapping;
- full-history tick sampling with first and last dates preserved;
- `all` being non-draggable and non-scrollable;
- removal of the redundant anomaly segment;
- HTML tooltip structure and fixed CSS dimensions;
- current-price input padding.

Browser verification will check the Yangtao `6h` example, fixed tooltip size before and after navigation, mouse-wheel directions, drag snapping, `7d`/`30d` daily movement, the non-interactive `all` view, reduced full-history labels, and the long current-price input value.

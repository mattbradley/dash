// part of https://github.com/rc-dukes/dash fork of https://github.com/mattbradley/dash
/**
 * Helper for Date
 */
function formatDate(date) {
  return date && date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true});
}

export { formatDate };

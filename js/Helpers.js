function formatDate(date) {
  return date && date.toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true});
}

export { formatDate };

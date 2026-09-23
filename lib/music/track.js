/**
 * A track of the queue. YouTube and SoundCloud tracks have a `url`; Spotify, Deezer and Apple Music ones
 * only have a `query` ("artist title"): their audio is protected, they are searched on YouTube when they play
 */
export function createTrack({ title, author, duration, thumbnail, url, query }, requestedBy) {
  return {
    title: title || 'Unknown title',
    author: author || 'Unknown artist',
    duration: duration ? Math.round(duration) : null,
    thumbnail: thumbnail ?? null,
    url: url ?? null,
    query: query ?? null,
    requestedBy,
  };
}

export function searchQuery(author, title) {
  return `${author} ${title}`.trim();
}

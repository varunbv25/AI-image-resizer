/**
 * Safely parses JSON responses from fetch calls
 * Handles cases where the server returns non-JSON responses (e.g., plain text errors)
 */
export async function safeJsonParse(response: Response) {
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  } else {
    // Response is not JSON, read as text
    const text = await response.text();
    throw new Error(text || 'Request failed with non-JSON response');
  }
}

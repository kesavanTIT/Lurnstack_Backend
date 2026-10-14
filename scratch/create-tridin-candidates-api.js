import { axiosClient } from './axiosClient';

const TRIDIN_CANDIDATES_ENDPOINT = '/api/tridin/admin/candidates';
const ADMIN_TRIDIN_ENDPOINT = '/api/admin/tridin/candidates';

export const fetchTridinCandidates = async () => {
  try {
    const response = await axiosClient.get(TRIDIN_CANDIDATES_ENDPOINT);
    return response.data;
  } catch (err) {
    // Fallback to /api/admin/tridin/candidates
    const fallback = await axiosClient.get(ADMIN_TRIDIN_ENDPOINT);
    return fallback.data;
  }
};

export const createTridinCandidate = async (payload) => {
  try {
    const response = await axiosClient.post(TRIDIN_CANDIDATES_ENDPOINT, payload);
    return response.data;
  } catch (err) {
    const fallback = await axiosClient.post(ADMIN_TRIDIN_ENDPOINT, payload);
    return fallback.data;
  }
};

export const deleteTridinCandidate = async (candidateId) => {
  try {
    const response = await axiosClient.delete(`${TRIDIN_CANDIDATES_ENDPOINT}/${candidateId}`);
    return response.data;
  } catch (err) {
    const fallback = await axiosClient.delete(`${ADMIN_TRIDIN_ENDPOINT}/${candidateId}`);
    return fallback.data;
  }
};

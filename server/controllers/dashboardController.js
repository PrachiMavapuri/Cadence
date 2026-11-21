import { getDashboardSummary } from '../services/dashboardService.js';

export async function summary(req, res) {
  const data = await getDashboardSummary(req.user);
  res.status(200).json({
    success: true,
    data,
  });
}

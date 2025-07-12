import React, { useState, useEffect, useCallback } from 'react';
import { getMicrojobs, createMicrojob } from '../api/services';
import {
  Container, Typography, List, ListItem, ListItemText, Button, CircularProgress,
  Alert, Paper, Modal, Box, TextField, Divider
} from '@mui/material';

// Style for the pop-up modals
const modalStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
  display: 'flex',
  flexDirection: 'column',
};

function MicroJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // State for the modals
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [jobToFund, setJobToFund] = useState(null); // Holds details for the funding modal
  
  const [newJobData, setNewJobData] = useState({
    title: '',
    description: '',
    ton_payment_amount: 0.1,
    // Add any other fields you need, like number of performers
  });

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const activeJobs = await getMicrojobs(); // Assuming this fetches 'active' jobs
      setJobs(activeJobs);
    } catch (err) {
      setError('Failed to fetch micro-jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleInputChange = (e) => {
    setNewJobData({ ...newJobData, [e.target.name]: e.target.value });
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      // Step 1: Call the backend to create the job with "pending_funding" status
      const response = await createMicrojob(newJobData);
      setCreateModalOpen(false); // Close the create modal
      
      // Step 2: Set the job details to trigger the funding modal
      setJobToFund(response.job_details); 
      alert("Job created successfully! Please fund the escrow contract to make it active.");

    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create job.');
    }
  };

  const handleFundJob = async () => {
    // --- THIS IS WHERE YOUR ON-CHAIN LOGIC GOES ---
    // TODO: Use TON Connect to create and send the `depositFunds` transaction
    // to the smart contract address stored in `jobToFund.escrow_contract_address`.
    
    alert(`
      Wallet integration needed!
      Action: Send ${jobToFund.ton_payment_amount} TON
      To: ${jobToFund.escrow_contract_address}
    `);

    // TODO: After sending the transaction, start polling your backend's
    // /microjobs/{job_id}/activate endpoint until it confirms the job is active.
    
    setJobToFund(null); // Close the funding modal for now
    fetchJobs(); // Refresh the job list
  };

  if (loading && jobs.length === 0) {
    return <Container sx={{ textAlign: 'center', mt: 4 }}><CircularProgress /></Container>;
  }

  return (
    <Container component="main" maxWidth="md">
      <Box sx={{ my: 4, textAlign: 'center' }}>
        <Typography component="h1" variant="h4" color="primary" gutterBottom>
          Micro-Job Marketplace
        </Typography>
        <Typography>Complete jobs for TON rewards, secured by our on-chain escrow.</Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={() => setCreateModalOpen(true)}>
          Post a New Job
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Paper elevation={3}>
        <List>
          {jobs.length > 0 ? jobs.map((job) => (
            <ListItem key={job.id} secondaryAction={
              <Button variant="outlined" onClick={() => alert(`Viewing details for Job ID: ${job.id}`)}>
                View Details
              </Button>
            }>
              <ListItemText 
                primary={`${job.title} (+${job.ton_payment_amount} TON)`} 
                secondary={job.description} 
              />
            </ListItem>
          )) : <Typography sx={{p: 2, textAlign: 'center', color: 'text.secondary'}}>No active jobs found.</Typography>}
        </List>
      </Paper>
      
      {/* Modal for Creating a New Job */}
      <Modal open={isCreateModalOpen} onClose={() => setCreateModalOpen(false)}>
        <Box sx={modalStyle} component="form" onSubmit={handleCreateJob}>
          <Typography variant="h6" component="h2" gutterBottom>Post a New Job</Typography>
          <TextField name="title" label="Job Title" fullWidth margin="normal" onChange={handleInputChange} required />
          <TextField name="description" label="Job Description" fullWidth margin="normal" multiline rows={4} onChange={handleInputChange} required />
          <TextField name="ton_payment_amount" label="Reward per person (in TON)" type="number" fullWidth margin="normal" onChange={handleInputChange} required />
          <TextField name="performers_needed" label="Number of People Needed (optional)" type="number" fullWidth margin="normal" onChange={handleInputChange} />
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Create Job</Button>
        </Box>
      </Modal>

      {/* Modal for Funding a Job */}
      {jobToFund && (
        <Modal open={true} onClose={() => setJobToFund(null)}>
          <Box sx={modalStyle}>
            <Typography variant="h6" component="h2" gutterBottom>Activate Your Job</Typography>
            <Typography sx={{ mt: 2 }}>
              Your job has been created. To make it live, you must fund the escrow contract.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography><strong>Job:</strong> {jobToFund.title}</Typography>
            <Typography><strong>Amount to Fund:</strong> {jobToFund.ton_payment_amount} TON</Typography>
            <Typography sx={{mt: 1, wordBreak: 'break-all'}}>
                <strong>Contract:</strong> {jobToFund.escrow_contract_address}
            </Typography>
            <Button variant="contained" fullWidth sx={{ mt: 3 }} onClick={handleFundJob}>
              Fund with Wallet
            </Button>
          </Box>
        </Modal>
      )}
    </Container>
  );
}

export default MicroJobsPage;

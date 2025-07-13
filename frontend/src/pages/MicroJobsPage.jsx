import React, { useState, useEffect, useCallback } from 'react';
import { getMicrojobs, createMicrojob, activateJob } from '../api/services'; // Make sure to add activateJob to services.js
import { useTonConnectUI } from '@tonconnect/ui-react';
import { toNano, beginCell } from '@ton/core';

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
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [jobToFund, setJobToFund] = useState(null);
  const [isFunding, setIsFunding] = useState(false);

  const [newJobData, setNewJobData] = useState({
    title: '',
    description: '',
    ton_payment_amount: 0.1,
    performers_needed: 1,
  });

  const [tonConnectUI] = useTonConnectUI();

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const activeJobs = await getMicrojobs();
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
      const response = await createMicrojob(newJobData);
      setCreateModalOpen(false);
      setJobToFund(response.job_details);
      alert("Job created successfully! Please fund the escrow contract to make it active.");
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create job.');
    }
  };

  const pollForJobActivation = async (jobId) => {
    const interval = setInterval(async () => {
      try {
        // This activateJob service will call your backend endpoint
        const updatedJob = await activateJob(jobId);
        if (updatedJob.status === 'active') {
          clearInterval(interval);
          setIsFunding(false);
          setJobToFund(null);
          alert("Job successfully activated!");
          fetchJobs();
        }
      } catch (error) {
        // Keep polling
        console.log("Polling for activation...");
      }
    }, 5000); // Check every 5 seconds
  };

  const handleFundJob = async () => {
    if (!jobToFund) return;
    setIsFunding(true);

    const amountInNano = toNano(jobToFund.ton_payment_amount).toString();
    const Opcodes = { depositFunds: 0x5e6f7a8b };

    // Create the message body (payload) for the smart contract
    const body = beginCell()
      .storeUint(Opcodes.depositFunds, 32)
      .storeUint(0, 64) // query_id
      .storeUint(jobToFund.id, 64) // Use 64 bits as defined in your FunC contract
      .endCell();

    const transaction = {
      validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      messages: [
        {
          address: jobToFund.escrow_contract_address,
          amount: amountInNano,
          payload: body.toBoc().toString("base64"), // The transaction payload
        },
      ],
    };

    try {
      await tonConnectUI.sendTransaction(transaction);
      alert("Funding transaction sent! Waiting for on-chain confirmation to activate job...");
      pollForJobActivation(jobToFund.id);
    } catch (error) {
      console.error(error);
      setIsFunding(false);
      alert("Transaction was rejected or failed.");
    }
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
            <ListItem key={job.id} secondaryAction={<Button variant="outlined">View Details</Button>}>
              <ListItemText 
                primary={`${job.title} (+${job.ton_payment_amount} TON)`} 
                secondary={job.description} 
              />
            </ListItem>
          )) : <Typography sx={{p: 2, textAlign: 'center', color: 'text.secondary'}}>No active jobs found.</Typography>}
        </List>
      </Paper>
      
      {/* Create Job Modal */}
      <Modal open={isCreateModalOpen} onClose={() => setCreateModalOpen(false)}>
        <Box sx={modalStyle} component="form" onSubmit={handleCreateJob}>
            {/* ... form fields from previous version ... */}
        </Box>
      </Modal>

      {/* Fund Job Modal */}
      {jobToFund && (
        <Modal open={true} onClose={() => !isFunding && setJobToFund(null)}>
          <Box sx={modalStyle}>
            <Typography variant="h6" component="h2" gutterBottom>Activate Your Job</Typography>
            <Typography sx={{ mt: 2 }}>
              Your job has been created. To make it live, you must fund the escrow contract.
            </Typography>
            <Divider sx={{ my: 2 }} />
            <Typography><strong>Job:</strong> {jobToFund.title}</Typography>
            <Typography><strong>Amount to Fund:</strong> {jobToFund.ton_payment_amount} TON</Typography>
            <Button variant="contained" fullWidth sx={{ mt: 3 }} onClick={handleFundJob} disabled={isFunding}>
              {isFunding ? <CircularProgress size={24} /> : 'Fund with Wallet'}
            </Button>
          </Box>
        </Modal>
      )}
    </Container>
  );
}

export default MicroJobsPage;

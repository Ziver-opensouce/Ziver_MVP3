import React, { useState, useEffect, useCallback } from 'react';
import { getAvailableTasks, completeTask, createSponsoredTask } from '../api/services';
import {
  Container, Typography, List, ListItem, ListItemText, Button, CircularProgress,
  Alert, Paper, Modal, Box, TextField, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';

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
};

function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [sponsoredTaskData, setSponsoredTaskData] = useState({
    title: '', description: '', zp_reward: 100, external_link: '', duration: '1_day'
  });

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAvailableTasks();
      setTasks(data);
    } catch (err) {
      setError('Failed to fetch tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCompleteTask = async (taskId) => {
    try {
      await completeTask(taskId);
      alert('Task completed successfully!');
      fetchTasks(); // Refresh the list of tasks
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to complete task.');
    }
  };

  const handleCreateSponsoredTask = async () => {
    try {
      await createSponsoredTask(sponsoredTaskData);
      alert('Your task has been posted!');
      setModalOpen(false);
      fetchTasks();
    } catch (err) {
        alert(err.response?.data?.detail || 'Failed to create task.');
    }
  };
  
  const handleInputChange = (e) => {
    setSponsoredTaskData({ ...sponsoredTaskData, [e.target.name]: e.target.value });
  };

  if (loading) {
    return <Container sx={{ textAlign: 'center', mt: 4 }}><CircularProgress /></Container>;
  }

  return (
    <Container component="main" maxWidth="md">
      <Box sx={{ my: 4, textAlign: 'center' }}>
        <Typography component="h1" variant="h4" color="primary" gutterBottom>
          Available Tasks
        </Typography>
        <Typography>Complete simple tasks to earn bonus ZP.</Typography>
        <Button variant="contained" sx={{ mt: 2 }} onClick={() => setModalOpen(true)}>
          Create Your Own Task
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Paper elevation={3}>
        <List>
          {tasks.map((task) => (
            <ListItem key={task.id} secondaryAction={
              <Button variant="outlined" onClick={() => handleCompleteTask(task.id)}>
                Complete
              </Button>
            }>
              <ListItemText 
                primary={`${task.title} (+${task.zp_reward} ZP)`} 
                secondary={task.description} 
              />
            </ListItem>
          ))}
        </List>
      </Paper>
      
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <Box sx={modalStyle}>
          <Typography variant="h6" component="h2">Create a Sponsored Task</Typography>
          <TextField name="title" label="Task Title" fullWidth margin="normal" onChange={handleInputChange} />
          <TextField name="description" label="Description" fullWidth margin="normal" onChange={handleInputChange} />
          <TextField name="external_link" label="Link (e.g., Twitter post)" fullWidth margin="normal" onChange={handleInputChange} />
          <TextField name="zp_reward" label="ZP Reward per completion" type="number" fullWidth margin="normal" value={sponsoredTaskData.zp_reward} onChange={handleInputChange} />
          <FormControl fullWidth margin="normal">
            <InputLabel>Duration</InputLabel>
            <Select name="duration" value={sponsoredTaskData.duration} label="Duration" onChange={handleInputChange}>
              <MenuItem value="1_day">1 Day (10,000 ZP)</MenuItem>
              <MenuItem value="5_days">5 Days (30,000 ZP)</MenuItem>
              <MenuItem value="15_days">15 Days (100,000 ZP)</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleCreateSponsoredTask}>Post Task</Button>
        </Box>
      </Modal>
    </Container>
  );
}

export default TasksPage;

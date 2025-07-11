import React, { useState, useEffect } from 'react';

// Using placeholder components
const Container = ({ children }) => <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', background: '#121212', color: 'white', minHeight: '100vh' }}>{children}</div>;
const Card = ({ children }) => <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '12px', width: '100%', maxWidth: '400px', textAlign: 'center', marginBottom: '20px' }}>{children}</div>;
const Button = (props) => <button {...props} style={{ width: '100%', padding: '15px', background: '#00E676', color: 'black', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' }}>{props.children}</button>;
const Typography = ({ children, variant }) => {
    if (variant === 'h2') return <h1 style={{ fontSize: '3rem', color: '#00E676', margin: '0 0 10px 0' }}>{children}</h1>;
    if (variant === 'h6') return <h3 style={{ margin: '0 0 20px 0', color: '#aaa' }}>{children}</h3>;
    return <p>{children}</p>;
}

function MiningPage() {
    // We will replace this with real data from the API later
    const [zpBalance, setZpBalance] = useState(1337);
    const [isMining, setIsMining] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(0);

    const handleStartMining = () => {
        // TODO: Call the startMiningCycle API service
        setIsMining(true);
        setTimeRemaining(4 * 60 * 60); // 4 hours in seconds
    };

    const handleClaim = () => {
        // TODO: Call the claim ZP API service
        setIsMining(false);
        setZpBalance(zpBalance + 50); // Simulate a claim
    };

    // Countdown timer effect
    useEffect(() => {
        if (isMining && timeRemaining > 0) {
            const timer = setTimeout(() => {
                setTimeRemaining(timeRemaining - 1);
            }, 1000);
            return () => clearTimeout(timer);
        } else if (isMining && timeRemaining === 0) {
            // Mining cycle finished
        }
    }, [isMining, timeRemaining]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <Container>
            <Card>
                <Typography variant='h6'>Your ZP Balance</Typography>
                <Typography variant='h2'>{zpBalance.toLocaleString()}</Typography>
            </Card>

            <Card>
                {isMining ? (
                    <div>
                        <h3>Mining In Progress</h3>
                        <p style={{ fontSize: '2rem', margin: '20px 0' }}>{formatTime(timeRemaining)}</p>
                        <Button onClick={handleClaim} disabled={timeRemaining > 0}>
                            {timeRemaining > 0 ? 'Mining...' : 'Claim ZP'}
                        </Button>
                    </div>
                ) : (
                    <Button onClick={handleStartMining}>Start Mining</Button>
                )}
            </Card>
            
            {/* We will add the Upgrade Miner section here later */}
        </Container>
    );
}

export default MiningPage;

